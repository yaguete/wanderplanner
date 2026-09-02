/**
 * Heurística para distinguir fuentes de inspiración (blogs, guías, crónicas
 * extraíbles a itinerario) de enlaces de *referencia*: ministerios, taquillas,
 * OTAs, webs oficiales de una atracción…
 *
 * «Añadir fuente» indexa el artículo en el viaje. Citar el origen de un precio
 * o un horario no debe disparar eso.
 *
 * Espejo de backend/inspirational_source.py: si cambias una, cambia la otra.
 */

import { isInstagramMediaUrl } from "@/lib/instagram-url"

const INSTITUTIONAL_HOST_SUFFIXES = [
  ".gob.es",
  ".gob.mx",
  ".gob.ar",
  ".gob.pe",
  ".gob.cl",
  ".gov",
  ".gov.uk",
  ".gouv.fr",
  ".europa.eu",
  ".who.int",
  ".un.org",
  ".cdc.gov",
]

/** Fragmentos de host típicos de trámites / oficiales. */
const INSTITUTIONAL_HOST_PARTS = [
  "immigration",
  "visa",
  "visas",
  "consul",
  "embassy",
  "exteriores",
  "maeuec",
  "interior.gob",
  "sanidad",
  "salud",
  "police",
  "customs",
  "aduana",
]

/** OTAs, taquillas, mapas, meteo, enciclopedias, redes. Hosts sin www. */
const REFERENCE_HOST_SUFFIXES = [
  "booking.com",
  "expedia.com",
  "hotels.com",
  "airbnb.com",
  "airbnb.es",
  "homeexchange.com",
  "agoda.com",
  "kayak.com",
  "skyscanner.com",
  "skyscanner.es",
  "trivago.com",
  "getyourguide.com",
  "viator.com",
  "tiqets.com",
  "klook.com",
  "musement.com",
  "civitatis.com",
  "headout.com",
  "ticketmaster.com",
  "eventbrite.com",
  "eventim.com",
  "feverup.com",
  "tripadvisor.com",
  "tripadvisor.es",
  "google.com",
  "google.es",
  "maps.google.com",
  "wikipedia.org",
  "wikivoyage.org",
  "wikimedia.org",
  "accuweather.com",
  "weather.com",
  "meteoblue.com",
  "wetter.com",
  "instagram.com",
  "tiktok.com",
  "facebook.com",
  "pinterest.com",
  "youtube.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "reddit.com",
  "axess.shop",
]

const REFERENCE_TLDS = [".shop", ".museum"]

/**
 * Etiquetas de host (entre puntos o guiones), no substrings: «burg» no debe
 * casar johannesburg ni salzburg.info.
 */
const REFERENCE_HOST_TOKENS = new Set([
  "museum",
  "museums",
  "museo",
  "museos",
  "musee",
  "palace",
  "palacio",
  "palais",
  "palazzo",
  "castle",
  "castillo",
  "chateau",
  "schloss",
  "festung",
  "cathedral",
  "catedral",
  "basilica",
  "basilique",
  "zoo",
  "aquarium",
  "airport",
  "aeropuerto",
  "flughafen",
  "tickets",
  "ticket",
  "ticketing",
  "axess",
])

/** Subdominio típico de taquilla: tickets.belvedere.at, shop.foo.com */
const REFERENCE_SUBDOMAIN_LABELS = new Set([
  "tickets",
  "ticket",
  "shop",
  "store",
  "booking",
  "buy",
])

const REFERENCE_PATH_SEGMENTS = new Set([
  "ticket",
  "tickets",
  "entrada",
  "entradas",
  "eintrittskarten",
  "biglietti",
  "shop",
  "store",
  "cart",
  "checkout",
  "buy",
  "purchase",
  "prices",
  "price",
  "precio",
  "precios",
  "preise",
  "tarifs",
  "tarifa",
  "tarifas",
  "hours",
  "horarios",
  "horario",
  "opening-hours",
  "opening",
  "orari",
  "visit",
  "visitor",
  "visitors",
])

const LOCALE_SEGMENTS = new Set([
  "en",
  "es",
  "de",
  "fr",
  "it",
  "pt",
  "ja",
  "zh",
  "nl",
  "pl",
  "ru",
  "uk",
  "ca",
  "eu",
  "gl",
  "en-us",
  "en-gb",
  "es-es",
  "pt-br",
  "zh-cn",
  "zh-tw",
])

const FILE_EXT = /\.(?:html?|php|aspx)$/i
const VENUE_IN_LABEL = /museum|museo|musee|festung/

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return host === suffix.replace(/^\./, "") || host.endsWith(suffix)
}

function hostLabels(host: string): string[] {
  return host.split(".").flatMap((part) => part.split("-")).filter(Boolean)
}

function pathSegments(path: string): string[] {
  return path
    .split("/")
    .map((seg) => seg.toLowerCase())
    .filter(Boolean)
}

function isInstitutionalHost(host: string): boolean {
  if (!host) return false
  if (/\.go\.[a-z]{2}$/i.test(host)) return true
  for (const suffix of INSTITUTIONAL_HOST_SUFFIXES) {
    if (hostMatchesSuffix(host, suffix)) return true
  }
  if (/\.gov\.[a-z]{2,}$/i.test(host)) return true
  return INSTITUTIONAL_HOST_PARTS.some((part) => host.includes(part))
}

function isReferenceHost(host: string): boolean {
  if (REFERENCE_TLDS.some((tld) => hostMatchesSuffix(host, tld))) return true
  for (const suffix of REFERENCE_HOST_SUFFIXES) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return true
  }
  const labels = hostLabels(host)
  if (labels.some((label) => REFERENCE_HOST_TOKENS.has(label))) return true
  if (labels.some((label) => VENUE_IN_LABEL.test(label))) return true
  const first = host.split(".")[0] ?? ""
  return REFERENCE_SUBDOMAIN_LABELS.has(first)
}

function isReferencePath(path: string): boolean {
  return pathSegments(path).some((seg) => REFERENCE_PATH_SEGMENTS.has(seg.replace(FILE_EXT, "")))
}

/**
 * Portada o solo locale (`/en`): no es un artículo extraíble.
 * Un segmento de path (`/japon/`, `/que-ver-en-viena/`) sí cuenta; las taquillas
 * y POIs oficiales se filtran por host/path de referencia, no por la forma del slug.
 */
function looksLikeArticlePath(path: string): boolean {
  const meaningful = pathSegments(path)
    .map((seg) => seg.replace(FILE_EXT, ""))
    .filter((seg) => !LOCALE_SEGMENTS.has(seg))
  return meaningful.length > 0
}

function parseHttpUrl(url: string): { host: string; path: string } | null {
  const raw = url.trim()
  if (!/^https?:\/\//i.test(raw)) return null
  try {
    const parsed = new URL(raw)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "")
    if (!host) return null
    return { host, path: parsed.pathname || "/" }
  } catch {
    return null
  }
}

/**
 * `true` si la URL parece institucional / trámite oficial
 * (no debe ofrecerse «Añadir fuente»).
 */
export function isInstitutionalSourceUrl(url: string): boolean {
  const parsed = parseHttpUrl(url)
  if (!parsed) return false
  return isInstitutionalHost(parsed.host)
}

/** Enlace apto para proponer / añadir como fuente de inspiración extraíble. */
export function isInspirationalSourceUrl(url: string): boolean {
  const parsed = parseHttpUrl(url)
  if (!parsed) return false
  if (isInstitutionalHost(parsed.host)) return false
  if (isInstagramMediaUrl(url)) return true
  if (isReferenceHost(parsed.host) || isReferencePath(parsed.path)) return false
  return looksLikeArticlePath(parsed.path)
}
