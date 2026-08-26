import assert from "node:assert/strict"
import { SHARE_TEXT_MAX, sanitizeShareSummaryClient } from "./share-summary"

{
  const raw = "```md\nAquí tienes tu resumen:\n**Día 2** · 3 noches\x00 en Granada\n```"
  const out = sanitizeShareSummaryClient(raw)
  assert.ok(!out.includes("```"))
  assert.ok(!out.includes("**"))
  assert.ok(!out.includes("\x00"))
  assert.ok(out.startsWith("Día 2"))
  assert.ok(out.includes("3 noches"))
  assert.ok(!out.includes("Aquí tienes"))
}

{
  const body = "Día 2 · llegada\n" + "hola mundo\n".repeat(200)
  const out = sanitizeShareSummaryClient(body)
  assert.ok(out.length <= SHARE_TEXT_MAX)
  assert.ok(out.includes("Día 2"))
  assert.ok(!out.endsWith("mun"))
  assert.ok(out.includes("hola mundo"))
}

{
  const raw = [
    "Mira el road trip de Alaska.",
    "Día 12 · Denali",
    "- Vuelo interior y un rato en el parque.",
    "Día 13 · Fairbanks y Chena",
  ].join("\n")
  const out = sanitizeShareSummaryClient(raw)
  assert.ok(out.includes("Denali"))
  assert.ok(!out.includes("Fairbanks y Chena"))
}

{
  const raw = [
    "Día 4 · Albaycín sin prisa",
    "- Tapeo y baños árabes.",
    "Día 5 · Vuelta a casa.",
  ].join("\n")
  const out = sanitizeShareSummaryClient(raw)
  assert.ok(out.includes("Día 5 · Vuelta a casa."))
}

{
  const raw =
    "Granada en un finde.\n\nIdeas sacadas de: Guía de tapas (@lacosmopolilla), QUÉ VER (@sinmapa) y"
  const out = sanitizeShareSummaryClient(raw)
  assert.ok(out.includes("Granada en un finde."))
  assert.ok(!out.includes("sinmapa"))
  assert.ok(!out.endsWith(" y"))
}

{
  const raw = "Granada en un finde.\n\nIdeas sacadas de: Guía de tapas (@lacosmopolilla)"
  const out = sanitizeShareSummaryClient(raw)
  assert.ok(out.includes("Ideas sacadas de: Guía de tapas (@lacosmopolilla)"))
}

{
  assert.equal(sanitizeShareSummaryClient("   \n  "), "")
}

console.log("share-summary: ok")
