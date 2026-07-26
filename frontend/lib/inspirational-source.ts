/**
 * Heurística para distinguir fuentes de inspiración (blogs, guías) de
 * enlaces institucionales (visados, ministerios, salud pública…)
 * donde no tiene sentido «Añadir fuente» al viaje.
 */

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

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return host === suffix.replace(/^\./, "") || host.endsWith(suffix)
}

/**
 * `true` si la URL parece institucional / trámite oficial
 * (no debe ofrecerse «Añadir fuente»).
 */
export function isInstitutionalSourceUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "")
    if (!host) return false

    // p. ej. visas.immigration.go.ug
    if (/\.go\.[a-z]{2}$/i.test(host)) return true

    for (const suffix of INSTITUTIONAL_HOST_SUFFIXES) {
      if (hostMatchesSuffix(host, suffix)) return true
    }

    // .gov.xx genérico
    if (/\.gov\.[a-z]{2,}$/i.test(host)) return true

    for (const part of INSTITUTIONAL_HOST_PARTS) {
      if (host.includes(part)) return true
    }

    return false
  } catch {
    return false
  }
}

/** Enlace apto para proponer / añadir como fuente de inspiración. */
export function isInspirationalSourceUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url.trim())) return false
  return !isInstitutionalSourceUrl(url)
}
