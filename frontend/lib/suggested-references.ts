/**
 * Directorio de blogs sugeridos en Tus fuentes.
 * Parte de `backend/landing_source_domains.py` (`LANDING_SOURCE_DOMAINS`).
 * Ampliar esta lista es el catálogo de la UI; el API de la landing es otra cosa.
 */
import { blogHomeUrl, normalizeFeedHost } from "@/lib/reference-feed"

export type SuggestedReference = {
  host: string
  label: string
}

/** Hosts sin `www.`, en el orden del catálogo de la landing. */
export const SUGGESTED_REFERENCES: readonly SuggestedReference[] = [
  { host: "lacosmopolilla.com", label: "La Cosmopolilla" },
  { host: "losviajesdeclaudia.com", label: "Los Viajes de Claudia" },
  { host: "viajeros30.com", label: "Viajeros 30" },
  { host: "cronicoviajero.com", label: "Crónico Viajero" },
  { host: "sinmapa.net", label: "Sin Mapa" },
  { host: "elviajemehizoami.com", label: "El viaje me hizo a mí" },
  { host: "viajes.chavetas.es", label: "Viajes Chavetas" },
  { host: "japonismo.com", label: "Japonismo" },
  { host: "losviajesdedomi.com", label: "Los Viajes de Domi" },
  { host: "mochileandoporelmundo.com", label: "Mochileando por el Mundo" },
  { host: "saltaconmigo.com", label: "Salta Conmigo" },
  { host: "mochilerosviajeros.com", label: "Mochileros Viajeros" },
  { host: "imanesdeviaje.com", label: "Imanes de Viaje" },
  { host: "demayorquierosermochilera.com", label: "De mayor quiero ser mochilera" },
  { host: "comeamaviaja.com", label: "Come Ama Viaja" },
  { host: "elrincondesele.com", label: "El Rincón de Sele" },
  { host: "viajandoporahi.com", label: "Viajando por Ahí" },
  { host: "mundo-nomada.com", label: "Mundo Nómada" },
  { host: "unviajededos.com", label: "Un Viaje de Dos" },
  { host: "elviajedesofi.com", label: "El Viaje de Sofi" },
]

export function suggestedReferenceHomeUrl(host: string): string {
  return blogHomeUrl(host)
}

export function isSuggestedReferenceAdded(
  host: string,
  knownDomains: readonly string[],
): boolean {
  const normalized = normalizeFeedHost(host) ?? host.replace(/^www\./i, "").toLowerCase()
  const allow = new Set(
    knownDomains
      .map((d) => normalizeFeedHost(d) ?? d.replace(/^www\./i, "").toLowerCase())
      .filter(Boolean),
  )
  return allow.has(normalized)
}

/** Las que aún no sigues primero; dentro de cada grupo, el orden del catálogo. */
export function sortSuggestedReferences(
  catalog: readonly SuggestedReference[],
  knownDomains: readonly string[],
): SuggestedReference[] {
  const available: SuggestedReference[] = []
  const added: SuggestedReference[] = []
  for (const item of catalog) {
    if (isSuggestedReferenceAdded(item.host, knownDomains)) added.push(item)
    else available.push(item)
  }
  return [...available, ...added]
}
