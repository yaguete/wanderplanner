/**
 * Destinos de envío del resumen de ruta. Puro salvo `canNativeShare`
 * (inspecciona `navigator` sin llamarlo).
 *
 * ❌ No llames a `navigator.share()` después de un `await`: iOS lo rechaza
 * fuera del gesto del usuario.
 */
import { SITE_URL } from "@/lib/site"

export const SHARE_FOOTER = "\n—\nMontada con wanderplanner.ai"
export const SHARE_TEXT_MAX = 1800
/**
 * Tope del href (ya encodeURIComponent). Un resumen de 1800 chars en español
 * se va a ~2.5–3.5k; 2000 apagaba el correo en el caso central. Mismo techo
 * que wa.me / t.me: por encima, copiar.
 */
export const MAILTO_HREF_MAX = 4000
/** wa.me / t.me: por encima se desactiva el enlace. */
export const DEEP_LINK_HREF_MAX = 4000

export const SHARE_LENGTH_REASON =
  "El texto es largo para este canal: cópialo y pégalo."

export type ShareTargetId = "copy" | "native" | "whatsapp" | "telegram" | "email"

export type ShareLinkTarget = {
  href: string | null
  reason?: string
}

export type ShareTargets = {
  copy: true
  native: boolean
  whatsapp: ShareLinkTarget
  telegram: ShareLinkTarget
  email: ShareLinkTarget
}

export function withShareFooter(text: string): string {
  const body = (text || "").trim()
  if (!body) return SHARE_FOOTER.trim()
  if (body.includes("wanderplanner.ai")) return body
  return `${body}${SHARE_FOOTER}`
}

function linkOrReason(href: string, max: number): ShareLinkTarget {
  if (href.length > max) return { href: null, reason: SHARE_LENGTH_REASON }
  return { href }
}

export function shareTargetsFor(
  text: string,
  opts?: { tripName?: string; nativeAvailable?: boolean },
): ShareTargets {
  const shareText = withShareFooter(text)
  const encoded = encodeURIComponent(shareText)
  const subject = encodeURIComponent((opts?.tripName || "Mira esta ruta").trim() || "Mira esta ruta")

  const whatsapp = linkOrReason(`https://wa.me/?text=${encoded}`, DEEP_LINK_HREF_MAX)
  const telegram = linkOrReason(
    `https://t.me/share/url?url=${encodeURIComponent(SITE_URL)}&text=${encoded}`,
    DEEP_LINK_HREF_MAX,
  )
  const email = linkOrReason(`mailto:?subject=${subject}&body=${encoded}`, MAILTO_HREF_MAX)

  return {
    copy: true,
    native: opts?.nativeAvailable ?? canNativeShare(),
    whatsapp,
    telegram,
    email,
  }
}

export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function"
}
