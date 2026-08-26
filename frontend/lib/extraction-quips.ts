/**
 * Frases de espera de la ardilla mientras se destila una fuente.
 *
 * Tres reglas que no se rompen:
 *
 * 1. **Esto no es estado.** El progreso real es `ItineraryProgressStage` y se
 *    pinta en su propia línea. Estas frases son voz de la mascota; van en
 *    primera persona y `aria-hidden`, para que nadie —ni un lector de
 *    pantalla— las lea como si fueran lo que el sistema está haciendo.
 * 2. **Nada de capacidades que no tenemos.** No consultamos horarios, precios
 *    ni disponibilidad. Una frase solo puede hablar de lo que el producto sí
 *    hace: leer el artículo, ordenar por días, separar tipos, guardar enlaces.
 * 3. **El humor nunca va sobre el texto del bloguero.** Los blogueros son el
 *    canal de adquisición de `/partners` y pegan sus propios artículos aquí.
 *    El chiste es siempre sobre el esfuerzo de la ardilla o sobre la logística
 *    del viaje, jamás sobre lo que el autor escribió.
 */

import type { ItineraryProgressStage } from "./api"

export type QuipPhase = "silent" | "working" | "long" | "patient"
export type QuipDeckName = "working" | "instagram" | "long" | "patient"
export type QuipDecks = Record<QuipDeckName, string[]>
export type QuipTick = { phase: QuipPhase; index: number }

/**
 * Curva de cadencia. No es constante a propósito: un reloj fijo se nota y
 * aburre. El arranque casi no espera —el hueco de la frase está reservado
 * desde el primer frame para que no salte el layout, y dejarlo en blanco varios
 * segundos parece un fallo, no una pausa—, pero tampoco es cero: así una
 * extracción que sale de caché termina sin llegar a pintar nada.
 */
export const QUIP_SILENCE_MS = 1_000
export const QUIP_LONG_AT_MS = 45_000
export const QUIP_PATIENT_AT_MS = 90_000

export const QUIP_WORKING_EVERY_MS = 7_000
export const QUIP_LONG_EVERY_MS = 10_000
export const QUIP_PATIENT_EVERY_MS = 15_000

/** Memoria corta entre extracciones para que dos seguidas no repitan frase. */
export const QUIP_SEEN_KEY = "wp-extraction-quips-seen"
export const QUIP_SEEN_MAX = 10

/** Ardilla trabajando + logística del viaje + meta y paciencia. */
export const WORKING_QUIPS: readonly string[] = [
  // La ardilla a lo suyo.
  "Guardando lo bueno en el carrillo.",
  "Esto a la despensa. Esto no.",
  "Trepando por los titulares.",
  "Otra avellana para tu itinerario.",
  "Subrayo con boli de cuatro colores.",
  "Tengo cuarenta pestañas abiertas. Como tú.",
  "Escondiendo las paradas buenas donde no se pierdan.",
  "Se me está llenando el carrillo.",
  "Me he traído el cuaderno bueno para esto.",
  "Desde la rama alta se ve todo mejor.",
  "Lo estoy dejando todo apuntado.",
  "He encontrado una buena. La subo arriba del todo.",
  "Esto lo dejo a mano, que lo vas a querer pronto.",
  "Ordenando el montón antes de enseñártelo.",
  "Voy con las dos manos llenas.",
  "No me distraigas, que voy contando.",
  // Logística: lo que de verdad hace el producto.
  "Comprobando si «cerca» son veinte minutos o cuatro horas.",
  "Poniendo cada sitio en el día que le toca.",
  "Repartiendo esto para que el martes no revientes.",
  "Separando dónde duermes de dónde comes.",
  "Rescatando los enlaces de reserva.",
  "Apuntando nombres que no sé pronunciar.",
  "Mirando qué cosas pegan juntas y cuáles no.",
  "Esto cae lejos. Igual va mejor otro día.",
  "Agrupando por barrios, que si no cruzas la ciudad tres veces.",
  "Separando lo que se reserva de lo que se improvisa.",
  "Contando cuántos días hacen falta de verdad.",
  "Esto son dos días, no uno. Lo dejo dicho.",
  "Dejando hueco para comer, que si no, no comes.",
  "Anotando cómo se va de un sitio a otro.",
  "Buscando dónde se duerme cada noche.",
  // Meta y paciencia.
  "Leyendo más rápido que tú. Sin ofender.",
  "Esto a mano serían veinte minutos y un cuaderno.",
  "Si tardara menos, no te fiarías.",
  "Voy a mi ritmo, pero voy.",
  "Podría ir más rápido saltándome cosas. Ni hablar.",
  "Tú ve pensando qué quieres hacer el primer día.",
  "Puedes irte a Mi viaje, que yo te aviso.",
  "No hace falta que te quedes mirando. Aunque me gusta.",
  "Queda menos que hace un momento.",
]

/** Post o reel de Instagram (`stage === "resolving"`). */
export const INSTAGRAM_QUIPS: readonly string[] = [
  "Abriendo el carrusel. Sí, las diez.",
  "Lo bueno está en la sexta diapositiva. Siempre.",
  "Leyendo el texto que va dentro de las fotos.",
  "El dato está entre los hashtags. Lo saco.",
  "Ampliando, que esto está escrito muy pequeño.",
  "Pasando diapositivas con la patita.",
  "Doce fotos, y yo con estas manos.",
  "Esto viene en vídeo. Me lo veo entero.",
]

/** A partir de 45 s el tono deja de ser gracioso y se vuelve cómplice. */
export const LONG_QUIPS: readonly string[] = [
  "Vale, este es más largo de lo normal.",
  "Este tiene tela. Aguanta un poco.",
  "Sigo aquí. Sigo leyendo.",
  "No me he perdido, es que hay mucho.",
  "Va a merecer la pena. Palabra de ardilla.",
  "Me queda el último tramo.",
  "Un poco más y te lo enseño.",
  "Estoy en las últimas. De verdad.",
]

/** A partir de 90 s ya no hay chiste: hay «sigo vivo». */
export const PATIENT_QUIPS: readonly string[] = [
  "Sigo trabajando. No te he abandonado.",
  "Esto va lento, pero va.",
  "Aguanto yo aquí. Tú haz otra cosa si quieres.",
  "Sigo en ello. Si se cae, te aviso.",
  "No me he quedado dormida. Sigo.",
]

export function shuffleWithRng<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    // rng() puede devolver 1 exacto; sin el clamp el índice se sale.
    const j = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))))
    const swap = out[i]
    out[i] = out[j]
    out[j] = swap
  }
  return out
}

/**
 * Baraja el pozo y empuja al final lo visto hace poco. No filtra: si `avoid`
 * se comiera el pozo entero nos quedaríamos sin frases.
 */
export function buildQuipDeck(
  pool: readonly string[],
  { rng, avoid = [] }: { rng: () => number; avoid?: readonly string[] },
): string[] {
  const shuffled = shuffleWithRng(pool, rng)
  if (avoid.length === 0) return shuffled
  const skip = new Set(avoid)
  const fresh = shuffled.filter((q) => !skip.has(q))
  if (fresh.length === 0) return shuffled
  return [...fresh, ...shuffled.filter((q) => skip.has(q))]
}

export function buildQuipDecks(opts: {
  rng: () => number
  avoid?: readonly string[]
}): QuipDecks {
  return {
    working: buildQuipDeck(WORKING_QUIPS, opts),
    instagram: buildQuipDeck(INSTAGRAM_QUIPS, opts),
    long: buildQuipDeck(LONG_QUIPS, opts),
    patient: buildQuipDeck(PATIENT_QUIPS, opts),
  }
}

/** Qué frase toca según el tiempo transcurrido. Puro: no lee el reloj. */
export function quipTickAt(elapsedMs: number): QuipTick {
  if (!Number.isFinite(elapsedMs) || elapsedMs < QUIP_SILENCE_MS) {
    return { phase: "silent", index: -1 }
  }
  if (elapsedMs < QUIP_LONG_AT_MS) {
    return {
      phase: "working",
      index: Math.floor((elapsedMs - QUIP_SILENCE_MS) / QUIP_WORKING_EVERY_MS),
    }
  }
  if (elapsedMs < QUIP_PATIENT_AT_MS) {
    return {
      phase: "long",
      index: Math.floor((elapsedMs - QUIP_LONG_AT_MS) / QUIP_LONG_EVERY_MS),
    }
  }
  return {
    phase: "patient",
    index: Math.floor((elapsedMs - QUIP_PATIENT_AT_MS) / QUIP_PATIENT_EVERY_MS),
  }
}

/** Milisegundos hasta el siguiente cambio. Siempre > 0. */
export function msUntilNextQuip(elapsedMs: number): number {
  const e = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  if (e < QUIP_SILENCE_MS) return QUIP_SILENCE_MS - e
  const nextStep = (start: number, every: number) =>
    start + (Math.floor((e - start) / every) + 1) * every
  if (e < QUIP_LONG_AT_MS) {
    return Math.min(nextStep(QUIP_SILENCE_MS, QUIP_WORKING_EVERY_MS), QUIP_LONG_AT_MS) - e
  }
  if (e < QUIP_PATIENT_AT_MS) {
    return Math.min(nextStep(QUIP_LONG_AT_MS, QUIP_LONG_EVERY_MS), QUIP_PATIENT_AT_MS) - e
  }
  return nextStep(QUIP_PATIENT_AT_MS, QUIP_PATIENT_EVERY_MS) - e
}

/**
 * El stage manda solo en un sitio: durante la fase de trabajo, un post de
 * Instagram cambia de baraja. Si el stage salta a mitad de fase la frase
 * cambia con él, que es justo lo que ha pasado de verdad.
 */
export function quipAt(
  decks: QuipDecks,
  tick: QuipTick,
  stage: ItineraryProgressStage | null,
): string | null {
  if (tick.phase === "silent" || tick.index < 0) return null
  const name: QuipDeckName =
    tick.phase === "working" && stage === "resolving" ? "instagram" : tick.phase
  const deck = decks[name]
  if (deck.length === 0) return null
  return deck[tick.index % deck.length]
}

function quipStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function readSeenQuips(storage?: Storage | null): string[] {
  const store = quipStorage(storage)
  if (!store) return []
  try {
    const raw = store.getItem(QUIP_SEEN_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((q): q is string => typeof q === "string").slice(0, QUIP_SEEN_MAX)
  } catch {
    return []
  }
}

export function rememberQuips(quips: readonly string[], storage?: Storage | null): void {
  const store = quipStorage(storage)
  if (!store) return
  const fresh = quips.filter((q) => typeof q === "string" && q.length > 0)
  if (fresh.length === 0) return
  const merged: string[] = []
  for (const q of [...fresh, ...readSeenQuips(store)]) {
    if (!merged.includes(q)) merged.push(q)
    if (merged.length >= QUIP_SEEN_MAX) break
  }
  try {
    store.setItem(QUIP_SEEN_KEY, JSON.stringify(merged))
  } catch {
    // sessionStorage lleno o bloqueado: la memoria corta es un lujo, no un requisito.
  }
}
