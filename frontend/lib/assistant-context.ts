/**
 * Briefing markdown del viaje para el asistente (enviado en cada POST /assistant/chat).
 */
import type { Source, Trip } from "@/types/itinerary"
import { BASIC_LABELS, ITEM_LABELS } from "@/lib/item-styles"
import { itemProvenanceLabel } from "@/lib/item-provenance"
import { countriesPlainList } from "@/lib/countries"
import { travelerTypeLabels } from "@/lib/traveler-profile"
import type { FavoriteReference, TravelerProfile } from "@/lib/db/profile-repo"

/** Presupuesto total aproximado de caracteres del briefing. */
const TOTAL_BUDGET = 180_000
/** Máximo de texto de artículo por fuente. */
const ARTICLE_PER_SOURCE = 28_000

function htmlToPlain(html: string): string {
  if (!html) return ""
  // Entorno cliente: DOMParser; sin DOM, strip tags.
  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html")
      const text = doc.body?.textContent || ""
      return text.replace(/\n{3,}/g, "\n\n").trim()
    } catch {
      /* fall through */
    }
  }
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + "\n…[truncado]"
}

/**
 * Perfil del viajero para el prompt del asistente. Debe quedarse corto: comparte
 * presupuesto de contexto con el briefing del viaje.
 */
export function buildUserProfileBriefing(
  profile: TravelerProfile | null,
  references: FavoriteReference[],
): string | null {
  const lines: string[] = []

  const types = profile?.travelerTypes ?? []
  if (types.length) {
    lines.push(`- Tipo de viajero: ${travelerTypeLabels(types).join(", ")}`)
  }
  if (profile?.travelerNotes?.trim()) {
    lines.push(`- Notas del usuario: ${profile.travelerNotes.trim()}`)
  }
  if (references.length) {
    lines.push("- Referencias de confianza (priorízalas, sin limitarte a ellas):")
    for (const ref of references) {
      const domain = ref.domain ? ` (${ref.domain})` : ""
      lines.push(`  - ${ref.label}${domain}`)
    }
  }

  if (!lines.length) return null
  return lines.join("\n")
}

/** Dominios de las referencias favoritas, para `include_domains` de Tavily. */
export function preferredDomainsFrom(references: FavoriteReference[]): string[] {
  const domains = references
    .map((r) => r.domain?.trim().toLowerCase())
    .filter((d): d is string => Boolean(d))
  return [...new Set(domains)]
}

export function buildTripBriefing(trip: Trip, sources: Source[]): string {
  const lines: string[] = []

  lines.push(`# Viaje: ${trip.name}`)
  lines.push(`- id: ${trip.id}`)
  if (trip.countries?.length) {
    lines.push(`- países (ISO): ${trip.countries.join(", ")} (${countriesPlainList(trip.countries)})`)
  } else {
    lines.push("- países: (ninguno configurado)")
  }
  lines.push(`- fechas: ${trip.startDate ?? "?"} → ${trip.endDate ?? "?"}`)
  lines.push(`- días del itinerario (numDays): ${trip.numDays ?? "?"}`)
  if (trip.expectations?.trim()) {
    lines.push("")
    lines.push("## Qué espera el usuario de este viaje")
    lines.push(trip.expectations.trim())
  }
  lines.push("")

  lines.push("## Plan del usuario (días e ítems)")
  trip.days.forEach((day, i) => {
    lines.push(`### Día ${i + 1} — id=\`${day.id}\`${day.label ? ` — ${day.label}` : ""}`)
    if (!day.items.length) {
      lines.push("- (sin ítems)")
    } else {
      for (const item of day.items) {
        const typeLabel = ITEM_LABELS[item.type] ?? item.type
        const region = item.region ? ` · ${item.region}` : ""
        const detail = item.detail ? ` — ${item.detail}` : ""
        lines.push(
          `- [${typeLabel}] **${item.name}**${region}${detail} (${itemProvenanceLabel(item)}; sourceId=${item.sourceId})`,
        )
      }
    }
    lines.push("")
  })

  lines.push("## Básicos del viaje")
  if (!trip.basics.length) {
    lines.push("(ninguno)")
  } else {
    for (const b of trip.basics) {
      const cat = BASIC_LABELS[b.category] ?? b.category
      lines.push(
        `- [${cat}] **${b.name}**${b.vendor ? ` (${b.vendor})` : ""}${b.detail ? ` — ${b.detail}` : ""}${b.affiliateUrl ? ` · ${b.affiliateUrl}` : ""}`,
      )
    }
  }
  lines.push("")

  lines.push("## Fuentes de inspiración")
  if (!sources.length) {
    lines.push("(ninguna fuente añadida)")
  }

  // Reparto del presupuesto de artículos entre fuentes
  const articleBudget = Math.max(
    4_000,
    Math.min(ARTICLE_PER_SOURCE, Math.floor((TOTAL_BUDGET * 0.55) / Math.max(sources.length, 1))),
  )

  for (const src of sources) {
    lines.push(`### Fuente: ${src.title}`)
    lines.push(`- id: ${src.id}`)
    lines.push(`- autor: ${src.author}`)
    lines.push(`- url: ${src.url}`)
    lines.push(`- área: ${src.area ?? "—"}`)
    lines.push("")
    lines.push("#### Ítems extraídos")
    if (!src.items.length) {
      lines.push("(ninguno)")
    } else {
      for (const it of src.items) {
        const typeLabel = ITEM_LABELS[it.type] ?? it.type
        const day = it.dayHint != null ? ` · día hint ${it.dayHint}` : ""
        const region = it.region ? ` · ${it.region}` : ""
        lines.push(`- [${typeLabel}] **${it.name}**${region}${day}${it.detail ? ` — ${it.detail}` : ""}`)
      }
    }
    lines.push("")
    lines.push("#### Descuentos / básicos de la fuente")
    if (!src.basics.length) {
      lines.push("(ninguno)")
    } else {
      for (const b of src.basics) {
        const cat = BASIC_LABELS[b.category] ?? b.category
        lines.push(
          `- [${cat}] **${b.name}**${b.vendor ? ` (${b.vendor})` : ""}${b.affiliateUrl ? ` · ${b.affiliateUrl}` : ""}`,
        )
      }
    }
    lines.push("")
    const article = truncate(htmlToPlain(src.articleHtml || ""), articleBudget)
    lines.push("#### Texto del artículo")
    lines.push(article || "(sin texto)")
    lines.push("")
  }

  let out = lines.join("\n")
  if (out.length > TOTAL_BUDGET) {
    out = out.slice(0, TOTAL_BUDGET) + "\n…[briefing truncado]"
  }
  return out
}
