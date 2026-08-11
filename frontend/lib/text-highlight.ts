/**
 * Búsqueda en texto con plegado de acentos e índices que apuntan al string original.
 * Usado por el find-in-page de la Crónica (no sirve para slugs: ver trip-tasks / countries).
 */

export type MatchRange = { start: number; end: number }

export type FoldedText = {
  /** Texto plegado (minúsculas, sin diacríticos). */
  folded: string
  /** folded[i] proviene de original[map[i]]. */
  map: number[]
}

const DIACRITIC_RE = /\p{M}/gu

/**
 * Pliega carácter a carácter guardando el índice original de cada code unit plegado.
 * Así los rangos de `findMatchRanges` se pueden aplicar al texto sin desplazar tildes.
 */
export function foldForSearch(text: string): FoldedText {
  const map: number[] = []
  let folded = ""

  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!
    const raw = String.fromCodePoint(cp)
    const width = raw.length
    const base = raw.normalize("NFD").replace(DIACRITIC_RE, "").toLowerCase()
    for (let j = 0; j < base.length; j++) {
      folded += base[j]!
      map.push(i)
    }
    i += width
  }

  return { folded, map }
}

/**
 * Rangos `[start, end)` sobre el texto **original** (no el plegado).
 * Sin RegExp: la query del usuario puede traer `(`, `[`, `*`, etc.
 * No solapa: avanza el cursor tras cada match.
 */
export function findMatchRanges(text: string, needle: string, max = Infinity): MatchRange[] {
  const trimmed = needle.trim()
  if (!trimmed || !text) return []

  const hay = foldForSearch(text)
  const needleFolded = foldForSearch(trimmed).folded
  if (!needleFolded) return []

  const ranges: MatchRange[] = []
  let from = 0
  while (ranges.length < max) {
    const at = hay.folded.indexOf(needleFolded, from)
    if (at < 0) break
    const startOrig = hay.map[at]!
    const lastFolded = at + needleFolded.length - 1
    const endOrig = hay.map[lastFolded]! + charWidthAt(text, hay.map[lastFolded]!)
    ranges.push({ start: startOrig, end: endOrig })
    from = at + Math.max(1, needleFolded.length)
  }
  return ranges
}

function charWidthAt(text: string, index: number): number {
  const cp = text.codePointAt(index)
  if (cp == null) return 1
  return String.fromCodePoint(cp).length
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"])
const MARK_CLASS = "source-highlight"
const MARK_CURRENT_CLASS = "source-highlight-current"

/** Quita marks previos y fusiona nodos de texto adyacentes. */
export function clearTextHighlights(root: ParentNode): void {
  const marks = root.querySelectorAll(`mark.${MARK_CLASS}`)
  for (const mark of marks) {
    const parent = mark.parentNode
    if (!parent) continue
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  }
}

/**
 * Resalta coincidencias en nodos de texto del `root`.
 * Devuelve los `<mark>` creados (orden documento). Tope `maxMarks` para artículos gigantes.
 *
 * Limitación: no encuentra términos partidos por etiquetas (p. ej. «Palacio de <b>Schönbrunn</b>»).
 */
export function highlightTextInElement(
  root: HTMLElement,
  needle: string,
  maxMarks = 400,
): HTMLElement[] {
  clearTextHighlights(root)
  const trimmed = needle.trim()
  if (!trimmed) return []

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT
      if (parent.closest(`mark.${MARK_CLASS}`)) return NodeFilter.FILTER_REJECT
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  type Pending = { node: Text; ranges: MatchRange[] }
  const pending: Pending[] = []
  let remaining = maxMarks

  let current = walker.nextNode()
  while (current && remaining > 0) {
    const textNode = current as Text
    const text = textNode.data
    const ranges = findMatchRanges(text, trimmed, remaining)
    if (ranges.length) {
      pending.push({ node: textNode, ranges })
      remaining -= ranges.length
    }
    current = walker.nextNode()
  }

  const marks: HTMLElement[] = []
  // Aplicar de atrás hacia delante para no invalidar offsets del mismo nodo.
  for (let i = pending.length - 1; i >= 0; i--) {
    const { node, ranges } = pending[i]!
    for (let r = ranges.length - 1; r >= 0; r--) {
      const { start, end } = ranges[r]!
      try {
        const range = document.createRange()
        range.setStart(node, start)
        range.setEnd(node, end)
        const mark = document.createElement("mark")
        mark.className = MARK_CLASS
        range.surroundContents(mark)
        marks.push(mark)
      } catch {
        // surroundContents falla si el rango corta un elemento; saltamos.
      }
    }
  }

  marks.reverse()
  return marks
}

/** Marca el match activo (aria-current) y limpia el anterior. */
export function setActiveHighlight(marks: HTMLElement[], index: number): HTMLElement | null {
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i]!
    const active = i === index
    mark.classList.toggle(MARK_CURRENT_CLASS, active)
    if (active) mark.setAttribute("aria-current", "true")
    else mark.removeAttribute("aria-current")
  }
  return marks[index] ?? null
}
