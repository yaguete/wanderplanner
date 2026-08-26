import assert from "node:assert/strict"
import {
  INSTAGRAM_QUIPS,
  LONG_QUIPS,
  PATIENT_QUIPS,
  QUIP_LONG_AT_MS,
  QUIP_PATIENT_AT_MS,
  QUIP_SEEN_KEY,
  QUIP_SEEN_MAX,
  QUIP_SILENCE_MS,
  WORKING_QUIPS,
  buildQuipDeck,
  buildQuipDecks,
  msUntilNextQuip,
  quipAt,
  quipTickAt,
  readSeenQuips,
  rememberQuips,
  shuffleWithRng,
} from "./extraction-quips"

/** LCG determinista: los tests no dependen de Math.random. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

// ---------- Fases y cadencia ----------

assert.deepEqual(quipTickAt(0), { phase: "silent", index: -1 })
assert.deepEqual(quipTickAt(QUIP_SILENCE_MS - 1), { phase: "silent", index: -1 })
assert.deepEqual(quipTickAt(QUIP_SILENCE_MS), { phase: "working", index: 0 })
// El hueco de la frase no puede quedarse en blanco más de un segundo: vacío y
// reservado parece un fallo de pintado, no una pausa.
assert.ok(QUIP_SILENCE_MS <= 1_000, "la primera frase tiene que entrar enseguida")
assert.deepEqual(quipTickAt(QUIP_SILENCE_MS + 6_999), { phase: "working", index: 0 })
assert.deepEqual(quipTickAt(QUIP_SILENCE_MS + 7_000), { phase: "working", index: 1 })
assert.deepEqual(quipTickAt(QUIP_LONG_AT_MS - 1), { phase: "working", index: 6 })
assert.deepEqual(quipTickAt(QUIP_LONG_AT_MS), { phase: "long", index: 0 })
assert.deepEqual(quipTickAt(QUIP_PATIENT_AT_MS - 1), { phase: "long", index: 4 })
assert.deepEqual(quipTickAt(QUIP_PATIENT_AT_MS), { phase: "patient", index: 0 })
assert.deepEqual(quipTickAt(QUIP_PATIENT_AT_MS + 30_000), { phase: "patient", index: 2 })
// Entradas basura no rompen la pantalla de espera.
assert.deepEqual(quipTickAt(Number.NaN), { phase: "silent", index: -1 })
assert.deepEqual(quipTickAt(-1), { phase: "silent", index: -1 })

// Cada baraja tiene frases de sobra para su fase: sin wrap, no hay repetición.
assert.ok(WORKING_QUIPS.length > quipTickAt(QUIP_LONG_AT_MS - 1).index)
assert.ok(INSTAGRAM_QUIPS.length > quipTickAt(QUIP_LONG_AT_MS - 1).index)
assert.ok(LONG_QUIPS.length > quipTickAt(QUIP_PATIENT_AT_MS - 1).index)
assert.ok(PATIENT_QUIPS.length > 0)

// El temporizador siempre avanza y siempre cae justo en el cambio de frase.
for (let e = 0; e <= 200_000; e += 137) {
  const delay = msUntilNextQuip(e)
  assert.ok(delay > 0, `delay no positivo en ${e}`)
  const before = quipTickAt(e)
  const after = quipTickAt(e + delay)
  assert.notDeepEqual(after, before, `la frase no cambió en ${e} + ${delay}`)
  assert.deepEqual(quipTickAt(e + delay - 1), before, `cambió antes de tiempo en ${e}`)
}

// ---------- Barajado ----------

const alwaysMax = () => 0.999999999
assert.deepEqual(shuffleWithRng([1, 2, 3], alwaysMax).slice().sort(), [1, 2, 3])
assert.deepEqual(shuffleWithRng([1, 2, 3], () => 0).slice().sort(), [1, 2, 3])
assert.deepEqual(shuffleWithRng([], seededRng(1)), [])

const deckA = buildQuipDeck(WORKING_QUIPS, { rng: seededRng(7) })
const deckB = buildQuipDeck(WORKING_QUIPS, { rng: seededRng(99) })
assert.equal(deckA.length, WORKING_QUIPS.length)
assert.equal(new Set(deckA).size, WORKING_QUIPS.length, "la baraja no puede repetir")
assert.notDeepEqual(deckA, deckB, "dos semillas distintas dan órdenes distintos")
assert.notDeepEqual(deckA, WORKING_QUIPS.slice(), "el orden no puede ser el del pozo")

// Lo visto hace poco va al final, pero no se pierde.
const avoid = deckA.slice(0, 5)
const deckAvoid = buildQuipDeck(WORKING_QUIPS, { rng: seededRng(7), avoid })
assert.equal(deckAvoid.length, WORKING_QUIPS.length)
for (const q of avoid) {
  assert.ok(deckAvoid.indexOf(q) >= WORKING_QUIPS.length - avoid.length, `«${q}» debía ir al final`)
}
// Si lo evitado se come el pozo entero, seguimos teniendo frases.
const deckAllAvoided = buildQuipDeck(LONG_QUIPS, { rng: seededRng(3), avoid: LONG_QUIPS })
assert.equal(deckAllAvoided.length, LONG_QUIPS.length)

// ---------- Selección de frase ----------

const decks = buildQuipDecks({ rng: seededRng(42) })
assert.equal(quipAt(decks, quipTickAt(0), "fetching"), null, "los primeros segundos van en silencio")
assert.equal(quipAt(decks, quipTickAt(QUIP_SILENCE_MS), "fetching"), decks.working[0])
// Instagram cambia de baraja, pero solo en la fase de trabajo.
assert.equal(quipAt(decks, quipTickAt(QUIP_SILENCE_MS), "resolving"), decks.instagram[0])
assert.equal(quipAt(decks, quipTickAt(QUIP_LONG_AT_MS), "resolving"), decks.long[0])
assert.equal(quipAt(decks, quipTickAt(QUIP_PATIENT_AT_MS), "resolving"), decks.patient[0])
assert.equal(quipAt(decks, quipTickAt(QUIP_SILENCE_MS), null), decks.working[0])

// Una espera entera de 45 s no repite ninguna frase.
const shown: string[] = []
for (let e = 0; e < QUIP_LONG_AT_MS; e += 250) {
  const q = quipAt(decks, quipTickAt(e), "fetching")
  if (q && q !== shown[shown.length - 1]) shown.push(q)
}
assert.equal(shown.length, 7)
assert.equal(new Set(shown).size, shown.length, "una misma espera no puede repetir frase")

// ---------- Memoria corta entre extracciones ----------

function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage
}

const store = fakeStorage()
assert.deepEqual(readSeenQuips(store), [])
rememberQuips(["uno", "dos"], store)
assert.deepEqual(readSeenQuips(store), ["uno", "dos"])
rememberQuips(["tres"], store)
assert.deepEqual(readSeenQuips(store), ["tres", "uno", "dos"], "lo último visto va primero")
rememberQuips(["uno"], store)
assert.deepEqual(readSeenQuips(store), ["uno", "tres", "dos"], "sin duplicados")
rememberQuips([], store)
assert.deepEqual(readSeenQuips(store), ["uno", "tres", "dos"])
for (let i = 0; i < 30; i++) rememberQuips([`q${i}`], store)
assert.equal(readSeenQuips(store).length, QUIP_SEEN_MAX, "la memoria corta está topada")

// Storage roto o con basura: la pantalla de espera no puede caerse por esto.
const broken = fakeStorage()
broken.setItem(QUIP_SEEN_KEY, "{no es json")
assert.deepEqual(readSeenQuips(broken), [])
broken.setItem(QUIP_SEEN_KEY, JSON.stringify({ a: 1 }))
assert.deepEqual(readSeenQuips(broken), [])
broken.setItem(QUIP_SEEN_KEY, JSON.stringify(["ok", 3, null]))
assert.deepEqual(readSeenQuips(broken), ["ok"])
assert.deepEqual(readSeenQuips(null), [])
rememberQuips(["x"], null)

// ---------- El contrato del tono ----------

const allQuips = [...WORKING_QUIPS, ...INSTAGRAM_QUIPS, ...LONG_QUIPS, ...PATIENT_QUIPS]
assert.equal(new Set(allQuips).size, allQuips.length, "no puede haber frases duplicadas entre pozos")

for (const q of allQuips) {
  assert.ok(q.trim() === q && q.length > 0, `«${q}» tiene espacios de más`)
  // El hueco reservado en la UI son dos líneas de `text-xs`.
  assert.ok(q.length <= 64, `«${q}» no cabe en dos líneas (${q.length})`)
  // Regla de CLAUDE.md: el humor jamás va sobre el texto del bloguero, que es
  // el canal de adquisición de /partners y pega aquí sus propios artículos.
  assert.ok(
    !/blogu|autor|redact|escrib|relleno|palabrer/i.test(q),
    `«${q}» se mete con quien escribió la fuente`,
  )
  // Y nunca prometemos algo que el producto no hace.
  assert.ok(
    !/horario|precio|€|disponibilidad|reservando|comprando/i.test(q),
    `«${q}» promete una capacidad que no tenemos`,
  )
}

console.log("extraction-quips: ok")
