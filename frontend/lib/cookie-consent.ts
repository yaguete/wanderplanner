/**
 * Consentimiento de analítica. localStorage (`wp-consent`), no cookie:
 * la landing pública no pone ni una sola cookie de primera parte.
 *
 * Safari (ITP) puede caducar el storage escrito por JS a los 7 días en
 * visitantes de poca interacción; el banner reaparece. Se acepta.
 */
export const CONSENT_KEY = "wp-consent"
export const CONSENT_VERSION = 1
/** 13 meses, tope habitual de la guía AEPD para un consentimiento. */
export const CONSENT_TTL_MS = 13 * 30 * 24 * 60 * 60 * 1000
export const CONSENT_CHANGED_EVENT = "wp-consent-changed"
export const CONSENT_OPEN_EVENT = "wp-consent-open"

export type ConsentChoice = "necessary" | "all"

export type ConsentRecord = {
  v: typeof CONSENT_VERSION
  choice: ConsentChoice
  decidedAt: number
}

export function parseConsent(raw: string | null, now = Date.now()): ConsentRecord | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== "object") return null
    const rec = data as Record<string, unknown>
    if (rec.v !== CONSENT_VERSION) return null
    if (rec.choice !== "necessary" && rec.choice !== "all") return null
    if (typeof rec.decidedAt !== "number" || !Number.isFinite(rec.decidedAt)) return null
    if (rec.decidedAt > now + 60_000) return null
    if (now - rec.decidedAt > CONSENT_TTL_MS) return null
    return { v: CONSENT_VERSION, choice: rec.choice, decidedAt: rec.decidedAt }
  } catch {
    return null
  }
}

export function readConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_KEY))
  } catch {
    return null
  }
}

export function writeConsent(choice: ConsentChoice, now = Date.now()): ConsentRecord | null {
  const record: ConsentRecord = { v: CONSENT_VERSION, choice, decidedAt: now }
  if (typeof window === "undefined") return record
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(record))
  } catch {
    // Safari privado / cuota: la decisión vale para esta carga, no se persiste.
  }
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT))
  return record
}

export function isAnalyticsAllowed(record: ConsentRecord | null): boolean {
  return record?.choice === "all"
}

export function openConsentBanner(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))
}
