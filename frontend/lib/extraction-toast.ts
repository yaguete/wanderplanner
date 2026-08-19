import type { Source } from "@/types/itinerary"

/** Copy del toast al consolidar una fuente extraída. Distingue ruta (A) de lista plana (B). */
export function extractionToastLabel(
  source: Pick<Source, "author" | "totalDays" | "items">,
): string {
  const handle = source.author.replace(/^@/, "").trim() || "fuente"
  const base = `Fuente añadida · @${handle}`
  if (source.totalDays != null) return base
  const n = source.items.length
  const sitios = n === 1 ? "1 sitio" : `${n} sitios`
  return `${base} — ${sitios}, sin ruta por días`
}
