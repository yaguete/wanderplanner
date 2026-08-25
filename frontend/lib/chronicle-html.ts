/**
 * Cura el HTML de la Crónica en el cliente: recorta cromo de cabecera
 * (migas, contadores, bylines, banners de afiliado) que se cuela cuando
 * el extractor no acierta el inicio del artículo.
 *
 * No persiste: el `articleHtml` original no se toca. Si la poda se pasa
 * de agresiva, se aborta y se muestra el HTML intacto.
 */

type Block = {
  tag: string
  html: string
  text: string
}

const VOID_TAGS = new Set(["img", "br", "hr", "wbr", "source", "meta", "link", "input"])

const AFFILIATE_RE =
  /\b(iati|heymondo|holafly|world\s*nomads|chapka|safetywing|airalo|nomad\s*insurance)\b/i

const PROMO_RE = /\d\s*%|descuento|cup[oó]n|c[oó]digo\s+promo|por ser lector/i

const INSURANCE_PROMO_RE = /\b(seguro(?:s)?(?:\s+de\s+viaje)?|e-?sims?|esim)\b/i

const UPDATED_RE =
  /^(actualizado|publicado|updated|posted|escrito|modificado|last\s+updated)(\s+(el|on|the))?\b/i

const DATE_ONLY_RE =
  /^(?:el\s+)?\d{1,2}(?:\s+de)?\s+[a-záéíóúüñ]+,?\s+\d{4}$/i

const SHARE_COUNT_RE =
  /^(?:[\d.,]+\s*[kKmM](?:\s*(?:visitas?|views?|shares?|me\s*gusta))?|[\d.,]+\s*(?:visitas?|views?|shares?))$/i

const CHROME_HEADING_RE =
  /^(blog|home|inicio|menú|menu|artículos?|relatos?(?:\s+de\s+viajes)?|categor[íi]a|category|archivo|archive|portada)$/i

const SHARE_TOOL_RE =
  /^(?:imprimir|print|pdf|e-?mail|correo|compartir|share|twitter|facebook|whatsapp)(?:\s+(?:imprimir|print|pdf|e-?mail|correo|compartir|share|twitter|facebook|whatsapp))*$/i

const BREADCRUMB_START_RE = /^(home|inicio|blog|portada)$/i

const MIN_BODY_CHARS = 90
/** Si tras podar queda menos de este ratio, se considera fallo y no se aplica. */
const KEEP_RATIO = 0.35
const MIN_ORIGINAL_FOR_RATIO = 400

export function curateArticleHtml(html: string): string {
  const raw = (html || "").trim()
  if (!raw) return html

  const blocks = splitTopLevelBlocks(raw)
  if (blocks.length <= 1) return html

  const kept = selectBodyBlocks(blocks)
  if (kept.length === 0) return html

  const origLen = blocks.reduce((n, b) => n + b.text.length, 0)
  const keptLen = kept.reduce((n, b) => n + b.text.length, 0)
  if (origLen >= MIN_ORIGINAL_FOR_RATIO && keptLen < origLen * KEEP_RATIO) return html

  return kept.map((b) => b.html).join("\n")
}

/**
 * Tras inyectar el HTML: oculta imágenes rotas o sin src y el párrafo
 * vacío que las envolvía. Solo cliente (necesita DOM).
 */
export function guardChronicleImages(root: ParentNode): void {
  const imgs = root.querySelectorAll("img")
  for (const node of imgs) {
    const img = node as HTMLImageElement
    img.loading = "lazy"
    img.decoding = "async"
    const hide = () => hideBrokenImage(img)
    const src = img.getAttribute("src") || ""
    if (!src || src.startsWith("data:image/gif")) {
      hide()
      continue
    }
    img.addEventListener("error", hide, { once: true })
    if (img.complete && img.naturalWidth === 0) hide()
  }
}

function hideBrokenImage(img: HTMLImageElement): void {
  img.hidden = true
  img.setAttribute("alt", img.getAttribute("alt") || "")
  const parent = img.parentElement
  if (!parent) return
  const stillVisible = parent.querySelectorAll("img:not([hidden])").length > 0
  if (!stillVisible && !(parent.textContent || "").trim()) {
    parent.hidden = true
  }
}

export function splitTopLevelBlocks(html: string): Block[] {
  const blocks: Block[] = []
  let i = 0
  const s = html
  while (i < s.length) {
    const next = s.indexOf("<", i)
    if (next < 0) {
      pushText(blocks, s.slice(i))
      break
    }
    if (next > i) pushText(blocks, s.slice(i, next))
    if (s.startsWith("<!--", next)) {
      const end = s.indexOf("-->", next + 4)
      i = end < 0 ? s.length : end + 3
      continue
    }
    const tagMatch = s.slice(next).match(/^<(\/)?([a-zA-Z][\w:-]*)([^>]*)>/)
    if (!tagMatch) {
      i = next + 1
      continue
    }
    if (tagMatch[1]) {
      i = next + tagMatch[0].length
      continue
    }
    const tag = tagMatch[2]!.toLowerCase()
    const isVoid = VOID_TAGS.has(tag) || /\/\s*$/.test(tagMatch[3] || "")
    if (isVoid) {
      const html = tagMatch[0]
      blocks.push({ tag, html, text: stripTags(html) })
      i = next + html.length
      continue
    }
    const close = findMatchingClose(s, next, tag)
    const chunk = s.slice(next, close)
    blocks.push({ tag, html: chunk, text: stripTags(chunk) })
    i = close
  }
  return blocks.filter((b) => b.tag !== "br" && (b.text.length > 0 || /<img\b/i.test(b.html)))
}

function pushText(blocks: Block[], raw: string): void {
  const text = raw.replace(/\s+/g, " ").trim()
  if (!text) return
  blocks.push({ tag: "p", html: `<p>${escapeText(raw.trim())}</p>`, text })
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function findMatchingClose(html: string, start: number, tag: string): number {
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, "ig")
  const closeRe = new RegExp(`</${tag}\\s*>`, "ig")
  const afterOpen = html.indexOf(">", start)
  if (afterOpen < 0) return html.length
  let depth = 1
  let i = afterOpen + 1
  while (i < html.length && depth > 0) {
    openRe.lastIndex = i
    closeRe.lastIndex = i
    const openM = openRe.exec(html)
    const closeM = closeRe.exec(html)
    const openAt = openM ? openM.index : Infinity
    const closeAt = closeM ? closeM.index : Infinity
    if (closeAt === Infinity && openAt === Infinity) return html.length
    if (openAt < closeAt) {
      depth++
      i = openAt + (openM?.[0].length ?? 1)
    } else {
      depth--
      i = closeAt + (closeM?.[0].length ?? 1)
      if (depth === 0) return i
    }
  }
  return html.length
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

function selectBodyBlocks(blocks: Block[]): Block[] {
  const kept: Block[] = []
  let enteredBody = false

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    if (enteredBody) {
      kept.push(block)
      continue
    }

    if (isChromeHeading(block) || isLeadingChrome(block, blocks[i + 1])) continue

    // Un titular se conserva, pero el cromo posterior (Print/PDF, byline) sigue
    // recortándose hasta el primer párrafo de verdad.
    if (isHeading(block.tag)) {
      kept.push(block)
      continue
    }

    if (isBodyBlock(block)) {
      enteredBody = true
      kept.push(block)
      continue
    }

    // Párrafo corto ambiguo delante del cuerpo: se trata como cromo.
    if (block.text.length < MIN_BODY_CHARS) continue

    enteredBody = true
    kept.push(block)
  }

  return kept
}

function isHeading(tag: string): boolean {
  return /^h[1-6]$/.test(tag)
}

function isLeadingChrome(block: Block, next?: Block): boolean {
  const visual = visualTag(block)

  if (isBrokenImage(block)) return true
  if (isShareCount(block.text)) return true
  if (isUpdatedOrDate(block.text)) return true
  if (isShareToolbar(block)) return true
  if (isBreadcrumb(block)) return true
  if (isAffiliatePromo(block)) return true
  if (isBylineList(block)) return true

  if (visual === "img") {
    if (next && isLeadingChrome(next)) return true
    if (next && isBylineList(next)) return true
    return false
  }

  return false
}

function isBodyBlock(block: Block): boolean {
  if (block.tag === "blockquote" && block.text.length >= 40) return true
  if (block.tag === "figure" && /<img\b/i.test(block.html) && !isBrokenImage(block)) return true
  if (
    (block.tag === "ul" || block.tag === "ol") &&
    !isBylineList(block) &&
    !isAffiliatePromo(block) &&
    !isBreadcrumb(block)
  ) {
    const items = block.html.match(/<li\b/gi)?.length ?? 0
    return items >= 3 && block.text.length >= 80
  }
  if (block.tag === "p" && block.text.length >= MIN_BODY_CHARS && !isAffiliatePromo(block) && !isBreadcrumb(block)) {
    return true
  }
  return false
}

function visualTag(block: Block): string {
  if (block.tag === "p" && /<img\b/i.test(block.html) && block.text.length < 8) return "img"
  return block.tag
}

function isBrokenImage(block: Block): boolean {
  if (!/<img\b/i.test(block.html)) return false
  const src = block.html.match(/<img\b[^>]*\bsrc=["']([^"']*)["']/i)?.[1] ?? ""
  if (!src.trim()) return true
  if (/^(data:image\/gif|data:image\/svg)/i.test(src)) return true
  if (/pixel|spacer|1x1|tracking/i.test(src)) return true
  return false
}

function isShareCount(text: string): boolean {
  return SHARE_COUNT_RE.test(text.trim())
}

function isUpdatedOrDate(text: string): boolean {
  const t = text.trim()
  if (UPDATED_RE.test(t)) return true
  if (DATE_ONLY_RE.test(t)) return true
  return false
}

function isChromeHeading(block: Block): boolean {
  if (!isHeading(block.tag)) return false
  return CHROME_HEADING_RE.test(block.text.trim())
}

function isShareToolbar(block: Block): boolean {
  const t = block.text.trim()
  if (t.length > 80) return false
  if (t && SHARE_TOOL_RE.test(t)) return true
  if (/print|pdf|mailto:/i.test(block.html) && t.length < 48) return true
  return false
}

function isBreadcrumb(block: Block): boolean {
  const text = block.text
  const items = block.html.match(/<li\b/gi)?.length ?? 0

  if ((block.tag === "ol" || block.tag === "ul") && items >= 2 && items <= 6) {
    const first = firstListItemText(block.html)
    if (first && BREADCRUMB_START_RE.test(first) && text.length < 280) return true
    if (/[>»›]/.test(text) && text.length < 280) return true
  }

  if (text.length > 120) return false
  const links = block.html.match(/<a\b/gi)?.length ?? 0
  const parts = text
    .split(/\s*[|/>»→›·]\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (links >= 3 && parts.length >= 3) return true
  if (parts.length >= 3 && parts.every((p) => p.length <= 24) && text.length <= 80) return true
  return false
}

function firstListItemText(html: string): string {
  const m = html.match(/<li\b[^>]*>([\s\S]*?)<\/li>/i)
  return m ? stripTags(m[1]!).trim() : ""
}

function isAffiliatePromo(block: Block): boolean {
  const t = block.text
  if (AFFILIATE_RE.test(t) && (PROMO_RE.test(t) || INSURANCE_PROMO_RE.test(t) || t.length < 160)) {
    return true
  }
  if (PROMO_RE.test(t) && INSURANCE_PROMO_RE.test(t) && t.length < 280) return true
  if (INSURANCE_PROMO_RE.test(t) && /⚠|internet|no te olvides/i.test(t) && t.length < 280) {
    return true
  }
  return false
}

function isBylineList(block: Block): boolean {
  if (block.tag !== "ul" && block.tag !== "ol") return false
  const items = block.html.match(/<li\b/gi)?.length ?? 0
  if (items < 1 || items > 4) return false
  if (block.text.length > 160) return false
  if (isUpdatedOrDate(block.text) || DATE_ONLY_RE.test(block.text) || /\d{4}/.test(block.text)) {
    return true
  }
  if (/<img\b/i.test(block.html) && block.text.length < 100) return true
  return false
}
