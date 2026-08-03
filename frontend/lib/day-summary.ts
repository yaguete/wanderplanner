/**
 * Firma de ítems del día + cliente de POST /day-summary.
 */
import { authHeaders } from "@/lib/api-auth"
import { parseApiDetail } from "@/lib/api"
import type { UserDayItem } from "@/types/itinerary"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

/**
 * Huella estable de los ítems del día (orden de ids).
 * Separador `|` (seguro en Postgres; `\0` provoca 22P05 en jsonb/text).
 * Añadir, quitar o reordenar cambia la firma y reactiva el botón de IA.
 */
export function dayItemsSignature(items: { id: string }[]): string {
  return items.map((i) => i.id).join("|")
}

/** Quita NUL (\u0000): Postgres no admite ese carácter en text/jsonb. */
export function stripNullChars(value: string): string {
  return value.replace(/\u0000/g, "")
}

/** Saneado defensivo en el cliente (espejo del backend). */
export function sanitizeDaySummaryClient(raw: string): string {
  let text = (raw || "").trim()
  text = text.replace(/^[\s"'«»`]+|[\s"'«»`]+$/g, "")
  text = text.replace(/\s+/g, " ")
  text = text.replace(/^(día|day)\s*\d+\s*[·:\-—–]?\s*/i, "")
  text = text.replace(/[.;,:!?¡¿«»"']+$/g, "").trim()
  const words = text.split(" ").filter(Boolean).slice(0, 4)
  let out = words.join(" ")
  if (out.length > 40) {
    out = out.slice(0, 40).replace(/\s+\S*$/, "").trim()
  }
  return out
}

export type DaySummaryPayload = {
  items: { type: UserDayItem["type"]; name: string; region?: string | null }[]
  country_codes?: string[]
  day_index?: number
}

export async function generateDaySummary(payload: DaySummaryPayload): Promise<string> {
  const res = await fetch(`${API_BASE}/day-summary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify({
      items: payload.items.map((i) => ({
        type: i.type,
        name: i.name,
        region: i.region ?? null,
      })),
      country_codes: payload.country_codes ?? [],
      day_index: payload.day_index ?? null,
    }),
  })

  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { detail?: unknown }
    const { message, limitError } = parseApiDetail(error.detail, res.status)
    if (limitError) throw limitError
    throw new Error(message)
  }

  const data = (await res.json()) as { summary?: string }
  const summary = typeof data.summary === "string" ? sanitizeDaySummaryClient(data.summary) : ""
  if (!summary) throw new Error("La IA no devolvió una descripción usable.")
  return summary
}
