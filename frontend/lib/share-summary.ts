/**
 * Cliente de POST /share-summary + saneado espejo del backend.
 */
import { authHeaders } from "@/lib/api-auth"
import { parseApiDetail } from "@/lib/api"
import type { SharePlanPayload } from "@/lib/share-briefing"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export const SHARE_TEXT_MAX = 1800

const DAY_HEADING = /^Días?\s+\d+\b/i
const BARE_DAY = /^Días?\s+\d+(?:\s*[-–—]\s*\d+)?(?:\s*[·.:\-–—])?\s*$/i
const HANGING_TAIL = /(?:\b(?:y|e|o|de|del|con|en|por|para|las?|los?|una?)\s*|[,(,:])$/i
const SENTENCE_END = /[.!?…»")]$/

function isOrphanDayHeading(lines: string[], last: string): boolean {
  if (!DAY_HEADING.test(last)) return false
  if (/[.!?…]$/.test(last)) return false
  if (BARE_DAY.test(last)) return true
  if (lines.length >= 2) {
    const prev = lines[lines.length - 2]!.trim()
    if (prev.startsWith("-") || prev.startsWith("·") || DAY_HEADING.test(prev)) return true
  }
  return false
}

function dropIncompleteTail(text: string): string {
  const lines = text.split("\n")
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop()
  if (!lines.length) return ""
  const last = lines[lines.length - 1]!.trim()
  if (isOrphanDayHeading(lines, last)) {
    lines.pop()
    return dropIncompleteTail(lines.join("\n").trim())
  }
  const lowered = last.toLowerCase()
  const creditsBroken =
    lowered.startsWith("ideas sacadas") &&
    (lowered.endsWith(" y") || last.endsWith(",") || (last.split("(").length - 1) > (last.split(")").length - 1))
  const hanging = HANGING_TAIL.test(last) && !SENTENCE_END.test(last)
  if (creditsBroken || hanging) {
    lines.pop()
    return dropIncompleteTail(lines.join("\n").trim())
  }
  return lines.join("\n").trim()
}

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
  if (text.length > SHARE_TEXT_MAX) {
    let cut = text.slice(0, SHARE_TEXT_MAX)
    const para = cut.lastIndexOf("\n\n")
    if (para >= Math.floor(SHARE_TEXT_MAX * 0.5)) {
      cut = cut.slice(0, para)
    } else {
      const nl = cut.lastIndexOf("\n")
      if (nl >= Math.floor(SHARE_TEXT_MAX * 0.6)) {
        cut = cut.slice(0, nl)
      } else {
        const sentence = Math.max(
          cut.lastIndexOf(". "),
          cut.lastIndexOf(".\n"),
          cut.lastIndexOf("! "),
          cut.lastIndexOf("? "),
          cut.lastIndexOf("…"),
        )
        if (sentence >= Math.floor(SHARE_TEXT_MAX * 0.5)) {
          cut = cut.slice(0, sentence + 1)
        } else {
          cut = cut.replace(/\s+\S*$/, "")
        }
      }
    }
    text = cut.trim()
  }
  return dropIncompleteTail(text)
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
