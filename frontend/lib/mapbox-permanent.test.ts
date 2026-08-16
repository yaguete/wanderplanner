/**
 * `resolvePermanentCoords`: coordenada persistible contra `mapbox.places-permanent`.
 *
 * Lo que se prueba aquí es el contrato de no-fallo. Los cuatro diálogos que
 * persisten lugares llaman a esta función y comparan por identidad
 * (`if (coords === s.center) return`) para saber si hubo mejora, así que:
 *
 * - ante cualquier problema tiene que devolver EL MISMO objeto `fallback`,
 * - y solo un objeto nuevo cuando el permanente respondió y el punto es creíble.
 *
 * Si esto se rompe, se persisten coordenadas del dataset temporal (problema de
 * licencia) o se pisa el sitio que eligió el usuario (problema de datos).
 */
process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.test"

import assert from "node:assert/strict"

type FetchCall = { url: string }
let calls: FetchCall[] = []

/** Sustituye fetch por una respuesta fija y devuelve las llamadas registradas. */
function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  calls = []
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url })
    return handler(url, init)
  }) as typeof fetch
}

function featureResponse(lng: number, lat: number): Response {
  return new Response(JSON.stringify({ features: [{ center: [lng, lat] }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

const madrid = { lng: -3.7038, lat: 40.4168 }

// `tsx` compila a CJS: sin top-level await. El import es dinámico a propósito,
// para que `NEXT_PUBLIC_MAPBOX_TOKEN` esté puesto antes de evaluar el módulo
// (mapbox.ts lee el token una sola vez, al cargarse).
async function main() {
const { resolvePermanentCoords } = await import("./mapbox")

// --- 1. Camino feliz: usa el dataset permanente y devuelve su punto ---------
{
  stubFetch(async () => featureResponse(-3.7, 40.42))
  const out = await resolvePermanentCoords("Madrid, España", madrid)
  assert.notEqual(out, madrid, "debería devolver un objeto nuevo al mejorar")
  assert.equal(out.lng, -3.7)
  assert.equal(out.lat, 40.42)
  assert.equal(calls.length, 1)
  assert.ok(
    calls[0]!.url.includes("/geocoding/v5/mapbox.places-permanent/"),
    `esperaba el dataset permanente, se pidió: ${calls[0]!.url}`,
  )
  assert.ok(
    !calls[0]!.url.includes("permanent=true"),
    "el permanente es un endpoint, no un parámetro de query",
  )
}

// --- 2. Deriva excesiva: homónimo en otro país, no se pisa lo elegido -------
{
  // Guadalajara de México cuando el usuario eligió la de España.
  stubFetch(async () => featureResponse(-103.35, 20.66))
  const fallback = { lng: -3.16, lat: 40.63 }
  const out = await resolvePermanentCoords("Guadalajara", fallback)
  assert.equal(out, fallback, "con deriva grande debe devolver el fallback intacto")
}

// --- 3. Respuestas que no sirven: siempre el fallback, nunca una excepción --
{
  stubFetch(async () => new Response("nope", { status: 500 }))
  const out = await resolvePermanentCoords("Error 500", madrid)
  assert.equal(out, madrid, "un 5xx no puede cambiar lo que se persiste")
}
{
  stubFetch(async () => new Response("{no es json", { status: 200 }))
  const out = await resolvePermanentCoords("JSON roto", madrid)
  assert.equal(out, madrid, "un cuerpo ilegible no puede propagar excepción")
}
{
  stubFetch(async () => new Response(JSON.stringify({ features: [] }), { status: 200 }))
  const out = await resolvePermanentCoords("Sin resultados", madrid)
  assert.equal(out, madrid, "sin features se queda como estaba")
}
{
  stubFetch(async () => {
    throw new TypeError("network down")
  })
  const out = await resolvePermanentCoords("Red caída", madrid)
  assert.equal(out, madrid, "la red caída no puede tumbar el guardado")
}

// --- 4. Timeout: aborta y devuelve el fallback ------------------------------
{
  stubFetch(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
      }),
  )
  const started = Date.now()
  const out = await resolvePermanentCoords("Servidor mudo", madrid, { timeoutMs: 40 })
  assert.equal(out, madrid, "al agotar el tiempo se persiste la temporal")
  assert.ok(Date.now() - started < 2000, "no debe esperar más allá del timeout")
}

// --- 5. Kill switch y entradas vacías: ni siquiera se llama a Mapbox --------
{
  process.env.NEXT_PUBLIC_MAPBOX_PERMANENT_GEOCODING = "false"
  stubFetch(async () => featureResponse(0, 0))
  const out = await resolvePermanentCoords("Apagado", madrid)
  assert.equal(out, madrid)
  assert.equal(calls.length, 0, "con el kill switch no se gasta una petición")
  delete process.env.NEXT_PUBLIC_MAPBOX_PERMANENT_GEOCODING
}
{
  stubFetch(async () => featureResponse(0, 0))
  const out = await resolvePermanentCoords("   ", madrid)
  assert.equal(out, madrid)
  assert.equal(calls.length, 0, "sin etiqueta no hay nada que geocodificar")
}

// --- 6. Caché: el permanente se paga una vez por lugar ----------------------
{
  stubFetch(async () => featureResponse(2.1734, 41.3851))
  const barcelona = { lng: 2.17, lat: 41.38 }
  const first = await resolvePermanentCoords("Barcelona, España", barcelona)
  const second = await resolvePermanentCoords("Barcelona, España", barcelona)
  assert.equal(calls.length, 1, "la segunda vez debe salir de caché")
  assert.deepEqual(second, first)
}

console.log("mapbox-permanent: OK")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
