/**
 * Sesgo de Search Box: países de la query + no anclar proximity al pin
 * cuando el usuario ya desambigua (coma o nombre de país).
 */
import { collectCountryCodesFromHint } from "./countries"

function uniqueCountryCodes(codes: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of codes) {
    const k = raw.trim().toLowerCase()
    if (k.length !== 2 || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

/** País en el texto, o «X, Y»: el pin actual (a veces el homónimo malo) no debe mandar. */
export function queryLooksGeographicallyQualified(query: string): boolean {
  if (/[,;]/.test(query)) return true
  return collectCountryCodesFromHint(query).length > 0
}

export function placeSearchBias(
  query: string,
  options: {
    proximity?: [number, number] | null
    countryCodes?: string[] | null
  } = {},
): {
  proximity: [number, number] | null
  countryCodes: string[]
} {
  const countryCodes = uniqueCountryCodes([
    ...collectCountryCodesFromHint(query),
    ...(options.countryCodes ?? []),
  ])
  return {
    proximity: queryLooksGeographicallyQualified(query)
      ? null
      : (options.proximity ?? null),
    countryCodes,
  }
}
