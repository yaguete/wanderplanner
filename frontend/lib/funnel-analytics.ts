/**
 * Embudo del CTA de blogs: único punto de disparo.
 *
 * Hoy solo escribe en el servidor (`POST /funnel`). El día que haya Pro,
 * `funnel()` es el sitio para encender Vercel Analytics sin tocar call sites.
 *
 * Nada de PII: ni emails, ni URLs completas. `post_slug` es el último segmento
 * del path del artículo. `ref` es el slug del partner (o null).
 */
import { parseRefParam } from "@/lib/partner-trip"
import { isOwnBookingAffiliateUrl } from "@/lib/booking-search"
import { FLIGHT_SEARCH_TRACKING_URL } from "@/lib/flight-search"
import { sourceKindFromUrl } from "@/lib/instagram-url"
import { readOnboardingFunnelOutcome } from "@/lib/onboarding"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export const FUNNEL_EVENT_NAMES = [
  "start_opened",
  "outbound_click",
  "account_created",
  "gate_shown",
] as const

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number]

export type OutboundTarget =
  | "booking"
  | "skyscanner"
  | "getyourguide"
  | "kayak"
  | "stay22"
  | "other"

export type OutboundAffiliate = "partner" | "own" | "none"

export type OutboundSurface =
  | "task_row"
  | "budget_row"
  | "route_card"
  | "assistant"
  | "flight_search"
  | "inspiration"

/**
 * Motivos por los que se abre el RegistrationGate. Mismo conjunto que `GateReason`
 * en `components/auth/registration-gate.tsx`: si divergen, el compilador avisa en
 * el call site. Y la misma lista vive en `ALLOWED_META_VALUES["reason"]` del backend.
 */
export const FUNNEL_GATE_REASONS = [
  "new-trip",
  "second-source",
  "home",
  "source-limit",
  "assistant-limit",
  "invite",
  "share-plan",
] as const

export type FunnelGateReason = (typeof FUNNEL_GATE_REASONS)[number]

export type FunnelAttribution = {
  ref: string | null
  postSlug: string | null
}

export type FunnelPayload = FunnelAttribution & {
  meta?: Record<string, string>
}

const ATTR_KEY = "wp-funnel-attr"
const START_KEY_PREFIX = "wp-funnel-start:"
const GATE_KEY_PREFIX = "wp-funnel-gate:"

function slugifySegment(raw: string): string | null {
  const folded = raw
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  if (!folded || folded.length > 120) return null
  return folded
}

/** Último segmento del path, sin dominio, query ni fragmento. */
export function postSlugFromSourceUrl(url: string): string | null {
  const raw = url.trim()
  if (!raw) return null
  try {
    const withScheme = /:\/\//.test(raw) ? raw : `https://${raw}`
    const parsed = new URL(withScheme)
    const segments = parsed.pathname.split("/").filter(Boolean)
    const last = segments.at(-1)
    if (!last) return null
    let decoded = last
    try {
      decoded = decodeURIComponent(last)
    } catch {
      /* segmento ya decodificado o % inválido */
    }
    return slugifySegment(decoded)
  } catch {
    return null
  }
}

/** Reusa `parseRefParam`. En capa 1 el ausente es `null`, no un sentinela. */
export function partnerRef(raw: string | null | undefined): string | null {
  return parseRefParam(raw ?? null)
}

export function startOpenedStorageKey(
  ref: string | null,
  postSlug: string | null,
): string {
  return `${START_KEY_PREFIX}${ref ?? ""}:${postSlug ?? ""}`
}

type StorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** True la primera vez; false si esta sesión ya contó ese CTA. */
export function claimStartOpened(storage: StorageLike, key: string): boolean {
  try {
    if (storage.getItem(key)) return false
    storage.setItem(key, "1")
    return true
  } catch {
    return true
  }
}

/**
 * Guarda del efecto de `start_opened`. No incluye captcha a propósito:
 * el evento tiene que dispararse mientras Turnstile está en pantalla.
 */
export function startOpenedGuard(input: {
  authLoading: boolean
  supabaseConfigured: boolean
}): boolean {
  return !input.authLoading && input.supabaseConfigured
}

/**
 * Al montar `/lacosmopolilla`: pisa `ref`; conserva `postSlug` solo si ya
 * era de este mismo partner (si no, `account_created` iría con `ref` null).
 */
export function attributionForBlogLanding(
  slug: string,
  stash: FunnelAttribution,
): FunnelAttribution {
  const ref = partnerRef(slug)
  return {
    ref,
    postSlug: ref && stash.ref === ref ? stash.postSlug : null,
  }
}

export function rememberFunnelAttribution(attr: FunnelAttribution): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(ATTR_KEY, JSON.stringify(attr))
  } catch {
    /* private mode */
  }
}

export function readFunnelAttribution(): FunnelAttribution {
  if (typeof window === "undefined") return { ref: null, postSlug: null }
  try {
    const raw = window.sessionStorage.getItem(ATTR_KEY)
    if (!raw) return { ref: null, postSlug: null }
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== "object") return { ref: null, postSlug: null }
    const rec = data as Record<string, unknown>
    return {
      ref: typeof rec.ref === "string" ? partnerRef(rec.ref) : null,
      postSlug: typeof rec.postSlug === "string" ? rec.postSlug : null,
    }
  } catch {
    return { ref: null, postSlug: null }
  }
}

export function mergeFunnelAttribution(
  override?: Partial<FunnelAttribution>,
): FunnelAttribution {
  const stash = readFunnelAttribution()
  const ref = override?.ref !== undefined ? override.ref : stash.ref
  const postSlug =
    override?.postSlug !== undefined ? override.postSlug : stash.postSlug
  return {
    ref: partnerRef(ref),
    postSlug: postSlug ? slugifySegment(postSlug) ?? postSlug : null,
  }
}

export function buildFunnelBody(
  name: FunnelEventName,
  payload: FunnelPayload,
): {
  name: FunnelEventName
  ref: string | null
  post_slug: string | null
  meta: Record<string, string>
} {
  const ref = partnerRef(payload.ref)
  const postSlug = payload.postSlug ? slugifySegment(payload.postSlug) : null
  const meta: Record<string, string> = {}
  if (payload.meta) {
    for (const [key, value] of Object.entries(payload.meta)) {
      if (typeof value !== "string") continue
      if (value.includes("://") || value.includes("@")) continue
      meta[key] = value.slice(0, 64)
    }
  }
  return {
    name,
    ref,
    post_slug: postSlug,
    meta,
  }
}

export function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase() || null
  } catch {
    return null
  }
}

export function classifyOutboundTarget(href: string): OutboundTarget {
  const host = hostnameFromUrl(href)
  if (!host) return "other"
  if (host === "booking.com" || host.endsWith(".booking.com")) return "booking"
  if (host === "stay22.com" || host.endsWith(".stay22.com")) return "stay22"
  if (host.includes("getyourguide.")) return "getyourguide"
  if (host.includes("kayak.")) return "kayak"
  if (host.includes("skyscanner.") || host === "pxf.io" || host.endsWith(".pxf.io")) {
    return "skyscanner"
  }
  return "other"
}

function isOwnFlightSearchUrl(href: string): boolean {
  try {
    const url = new URL(href)
    const tracking = new URL(FLIGHT_SEARCH_TRACKING_URL)
    return (
      url.hostname.toLowerCase() === tracking.hostname.toLowerCase() &&
      url.pathname.replace(/\/$/, "") === tracking.pathname.replace(/\/$/, "")
    )
  } catch {
    return false
  }
}

export function classifyOutboundAffiliate(
  href: string,
  source: "partner" | "own" | "none" | "auto" = "auto",
): OutboundAffiliate {
  if (source === "partner" || source === "own" || source === "none") return source
  if (isOwnBookingAffiliateUrl(href)) return "own"
  if (isOwnFlightSearchUrl(href)) return "own"
  const target = classifyOutboundTarget(href)
  if (target === "booking" || target === "stay22" || target === "getyourguide" || target === "kayak") {
    return "partner"
  }
  return "none"
}

export function recordFunnel(name: FunnelEventName, payload: FunnelPayload): void {
  if (typeof window === "undefined") return
  const body = buildFunnelBody(name, payload)
  try {
    void fetch(`${API_BASE}/funnel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      /* fire-and-forget */
    })
  } catch {
    /* private mode / sin red */
  }
}

/** Único disparo que usan los call sites. Hoy = capa 1; hueco para capa 2. */
export function funnel(name: FunnelEventName, payload: FunnelPayload): void {
  recordFunnel(name, payload)
}

export function recordStartOpenedOnce(input: {
  ref: string | null
  sourceUrl: string
  storage?: StorageLike
}): boolean {
  const ref = partnerRef(input.ref)
  const postSlug = postSlugFromSourceUrl(input.sourceUrl)
  const storage =
    input.storage ??
    (typeof window !== "undefined" ? window.sessionStorage : null)
  if (!storage) return false
  const key = startOpenedStorageKey(ref, postSlug)
  if (!claimStartOpened(storage, key)) return false
  rememberFunnelAttribution({ ref, postSlug })
  funnel("start_opened", {
    ref,
    postSlug,
    meta: { sourceKind: sourceKindFromUrl(input.sourceUrl) },
  })
  return true
}

export function outbound(
  href: string,
  meta: {
    affiliate?: OutboundAffiliate | "auto"
    surface: OutboundSurface
    ref?: string | null
    postSlug?: string | null
  },
): void {
  const attr = mergeFunnelAttribution({
    ref: meta.ref,
    postSlug: meta.postSlug,
  })
  funnel("outbound_click", {
    ...attr,
    meta: {
      target: classifyOutboundTarget(href),
      affiliate: classifyOutboundAffiliate(href, meta.affiliate ?? "auto"),
      surface: meta.surface,
    },
  })
}

/**
 * La modal de registro se ha puesto delante de un invitado. Contesta la pregunta que
 * `account_created` no puede: cuánta gente llega a ver la petición de cuenta, y a raíz
 * de qué acción. Sin esto, un embudo con pocas altas es ambiguo — no se distingue
 * «la ven y la rechazan» de «no llegan a verla».
 *
 * Una vez por sesión y motivo, con la misma guarda que `start_opened`: la modal se
 * reabre sola cada 3 minutos, así que sin guarda esto contaría insistencias, no
 * personas, y dejaría de ser comparable con `start_opened`.
 */
export function gateShownStorageKey(reason: FunnelGateReason): string {
  return `${GATE_KEY_PREFIX}${reason}`
}

export function recordGateShown(
  reason: FunnelGateReason,
  storage?: StorageLike | null,
): boolean {
  const store =
    storage ?? (typeof window !== "undefined" ? window.sessionStorage : null)
  // Sin sessionStorage (modo privado) preferimos contar de más a no contar.
  if (store && !claimStartOpened(store, gateShownStorageKey(reason))) return false
  funnel("gate_shown", {
    ...mergeFunnelAttribution(),
    meta: { reason },
  })
  return true
}

export function recordAccountCreated(override?: Partial<FunnelAttribution>): void {
  funnel("account_created", {
    ...mergeFunnelAttribution(override),
    meta: { onboarding: readOnboardingFunnelOutcome() },
  })
}
