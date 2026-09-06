import assert from "node:assert/strict"
import {
  ASSISTANT_FIRST_TRIP_PANELS,
  DEFAULT_TRIP_PANELS,
  isAssistantFirstVisitor,
  resolveEntryPanels,
  resolveEntrySection,
  type TripPanelPrefs,
} from "./trip-entry-layout"

// Invitado: siempre entra por el asistente, sin esperar el recuento de viajes.
assert.equal(
  isAssistantFirstVisitor({ isGuest: true, tripsLoading: true, activeTripCount: 0 }),
  true,
)
// Cuenta con un solo viaje: también.
assert.equal(
  isAssistantFirstVisitor({ isGuest: false, tripsLoading: false, activeTripCount: 1 }),
  true,
)
assert.equal(
  isAssistantFirstVisitor({ isGuest: false, tripsLoading: false, activeTripCount: 0 }),
  true,
)
// Con más de un viaje ya conoce la casa.
assert.equal(
  isAssistantFirstVisitor({ isGuest: false, tripsLoading: false, activeTripCount: 2 }),
  false,
)
// Mientras carga el listado no se decide: un solo viaje hidratado no es «su
// primer viaje», y abrirle el asistente a un veterano le movería los paneles.
assert.equal(
  isAssistantFirstVisitor({ isGuest: false, tripsLoading: true, activeTripCount: 1 }),
  false,
)

{
  const entry = { stored: null, assistantFirst: true, forcePlan: false }
  assert.deepEqual(resolveEntryPanels(entry), ASSISTANT_FIRST_TRIP_PANELS)
  assert.equal(resolveEntrySection(entry), "assistant")
}

{
  const entry = { stored: null, assistantFirst: false, forcePlan: false }
  assert.deepEqual(resolveEntryPanels(entry), DEFAULT_TRIP_PANELS)
  assert.equal(resolveEntrySection(entry), "sources")
}

{
  // La preferencia guardada gana: aunque sea su primer viaje, si ya cerró el
  // asistente en este navegador se respeta.
  const stored: TripPanelPrefs = { sources: false, plan: true, assistant: false }
  const entry = { stored, assistantFirst: true, forcePlan: false }
  assert.deepEqual(resolveEntryPanels(entry), stored)
  assert.equal(resolveEntrySection(entry), "sources")
}

{
  // `?tab=` (widget MCP) abre el plan sin tocar el resto, y manda en móvil.
  assert.deepEqual(resolveEntryPanels({ stored: null, assistantFirst: true, forcePlan: true }), {
    sources: true,
    plan: true,
    assistant: true,
  })
  assert.equal(
    resolveEntrySection({ stored: null, assistantFirst: true, forcePlan: true }),
    "plan",
  )
}

{
  // No mutar las constantes al forzar el plan.
  resolveEntryPanels({ stored: null, assistantFirst: true, forcePlan: true })
  assert.equal(ASSISTANT_FIRST_TRIP_PANELS.plan, false)
  resolveEntryPanels({ stored: null, assistantFirst: false, forcePlan: true })
  assert.equal(DEFAULT_TRIP_PANELS.assistant, false)
}

console.log("trip-entry-layout: ok")
