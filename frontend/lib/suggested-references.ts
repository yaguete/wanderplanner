/**
 * Directorio de blogs sugeridos en Tus fuentes.
 * El catálogo de la UI vive aquí; `backend/landing_source_domains.py` es otra
 * cosa (buscador de la landing). Ampliar esta lista es añadir o quitar tarjetas.
 */
import { blogHomeUrl, normalizeFeedHost } from "@/lib/reference-feed"

export type SuggestedLang = "es" | "en"

export type SuggestedReference = {
  host: string
  label: string
  lang: SuggestedLang
}

export const SUGGESTED_LANGS: readonly { id: SuggestedLang; label: string }[] = [
  { id: "es", label: "En español" },
  { id: "en", label: "En inglés" },
]

export const SUGGESTED_LANG_STORAGE_KEY = "wp-suggested-lang"

export function parseSuggestedLang(raw: string | null | undefined): SuggestedLang {
  return raw === "en" ? "en" : "es"
}

export function readStoredSuggestedLang(): SuggestedLang {
  if (typeof window === "undefined") return "es"
  try {
    return parseSuggestedLang(sessionStorage.getItem(SUGGESTED_LANG_STORAGE_KEY))
  } catch {
    return "es"
  }
}

export function writeStoredSuggestedLang(lang: SuggestedLang): void {
  try {
    sessionStorage.setItem(SUGGESTED_LANG_STORAGE_KEY, lang)
  } catch {
    /* private mode */
  }
}

/** Hosts sin `www.`. Español primero (España + LatAm), luego inglés. */
export const SUGGESTED_REFERENCES: readonly SuggestedReference[] = [
  { lang: "es", host: "lacosmopolilla.com", label: "La Cosmopolilla" },
  { lang: "es", host: "losviajesdeclaudia.com", label: "Los Viajes de Claudia" },
  { lang: "es", host: "viajeros30.com", label: "Viajeros 30" },
  { lang: "es", host: "cronicoviajero.com", label: "Crónico Viajero" },
  { lang: "es", host: "sinmapa.net", label: "Sin Mapa" },
  { lang: "es", host: "elviajemehizoami.com", label: "El viaje me hizo a mí" },
  { lang: "es", host: "viajes.chavetas.es", label: "Viajes Chavetas" },
  { lang: "es", host: "japonismo.com", label: "Japonismo" },
  { lang: "es", host: "losviajesdedomi.com", label: "Los Viajes de Domi" },
  { lang: "es", host: "mochileandoporelmundo.com", label: "Mochileando por el Mundo" },
  { lang: "es", host: "saltaconmigo.com", label: "Salta Conmigo" },
  { lang: "es", host: "mochilerosviajeros.com", label: "Mochileros Viajeros" },
  { lang: "es", host: "imanesdeviaje.com", label: "Imanes de Viaje" },
  { lang: "es", host: "demayorquierosermochilera.com", label: "De mayor quiero ser mochilera" },
  { lang: "es", host: "comeamaviaja.com", label: "Come Ama Viaja" },
  { lang: "es", host: "elrincondesele.com", label: "El Rincón de Sele" },
  { lang: "es", host: "viajandoporahi.com", label: "Viajando por Ahí" },
  { lang: "es", host: "mundo-nomada.com", label: "Mundo Nómada" },
  { lang: "es", host: "unviajededos.com", label: "Un Viaje de Dos" },
  { lang: "es", host: "elviajedesofi.com", label: "El Viaje de Sofi" },
  // Latinoamérica
  { lang: "es", host: "acrobatadelcamino.com", label: "Acróbata del Camino" },
  { lang: "es", host: "marcandoelpolo.com", label: "Marcando el Polo" },
  { lang: "es", host: "nativodelviaje.com", label: "Nativo del Viaje" },
  { lang: "es", host: "diasderuta.com", label: "Días de ruta" },
  { lang: "es", host: "ibamos.com", label: "Íbamos" },
  // English
  { lang: "en", host: "nomadicmatt.com", label: "Nomadic Matt" },
  { lang: "en", host: "alongdustyroads.com", label: "Along Dusty Roads" },
  { lang: "en", host: "neverendingvoyage.com", label: "Never Ending Voyage" },
  { lang: "en", host: "expertvagabond.com", label: "Expert Vagabond" },
  { lang: "en", host: "theblondeabroad.com", label: "The Blonde Abroad" },
  { lang: "en", host: "legalnomads.com", label: "Legal Nomads" },
  { lang: "en", host: "theplanetd.com", label: "The Planet D" },
  { lang: "en", host: "adventurousmiriam.com", label: "Adventurous Miriam" },
  { lang: "en", host: "againstthecompass.com", label: "Against the Compass" },
  { lang: "en", host: "earthtrekkers.com", label: "Earth Trekkers" },
  { lang: "en", host: "indietraveller.co", label: "Indie Traveller" },
  { lang: "en", host: "wildjunket.com", label: "WildJunket" },
  { lang: "en", host: "travelsofadam.com", label: "Travels of Adam" },
  { lang: "en", host: "thepoortraveler.net", label: "The Poor Traveler" },
  { lang: "en", host: "ytravelblog.com", label: "Y Travel Blog" },
  { lang: "en", host: "handluggageonly.co.uk", label: "Hand Luggage Only" },
]

export function suggestedReferencesForLang(
  lang: SuggestedLang,
  catalog: readonly SuggestedReference[] = SUGGESTED_REFERENCES,
): SuggestedReference[] {
  return catalog.filter((item) => item.lang === lang)
}

export function suggestedLangLabel(lang: SuggestedLang): string {
  return SUGGESTED_LANGS.find((item) => item.id === lang)?.label ?? "En español"
}

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
