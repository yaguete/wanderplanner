/**
 * Cliente de POST /share-summary + saneado espejo del backend.
 */
import { authHeaders } from "@/lib/api-auth"
import { parseApiDetail } from "@/lib/api"
import type { SharePlanPayload } from "@/lib/share-briefing"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export const SHARE_TEXT_MAX = 1800

export function sanitizeShareSummaryClient(raw: string): string {
  let text = (raw || "").replace(/\u0000/g, "").trim()
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  text = text.replace(/^```(?:\w+)?\s*/, "")
  text = text.replace(/\s*```$/, "")
  text = text.replace(
    /^(aquí tienes(?: tu)? resumen(?: de(?:l viaje)?)?|resumen(?: del viaje)?)\s*[:.—–-]\s*/i,
    "",
  )
  text = text.replace(/\*\*|__/g, "")
  text = text.replace(/^#{1,6}\s+/gm, "")
  text = text.replace(/\n{3,}/g, "\n\n").trim()
  if (text.length <= SHARE_TEXT_MAX) return text
  const cut = text.slice(0, SHARE_TEXT_MAX)
  const nl = cut.lastIndexOf("\n")
  if (nl >= Math.floor(SHARE_TEXT_MAX * 0.6)) return cut.slice(0, nl).trim()
  return cut.replace(/\s+\S*$/, "").trim()
}

export async function generateShareSummary(
  payload: SharePlanPayload,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${API_BASE}/share-summary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { detail?: unknown }
    const { message, limitError } = parseApiDetail(error.detail, res.status)
    if (limitError) throw limitError
    throw new Error(message)
  }

  const data = (await res.json()) as { summary?: string }
  const summary =
    typeof data.summary === "string" ? sanitizeShareSummaryClient(data.summary) : ""
  if (!summary) throw new Error("La IA no devolvió un resumen usable.")
  return summary
}
