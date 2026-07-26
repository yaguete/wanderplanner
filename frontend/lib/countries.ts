/** Dataset estático: nombres en español (ISO 3166-1 alpha-2).
 *  Generado desde https://github.com/umpirsky/country-list (data/es).
 */
export type CountryOption = { code: string; name: string; emoji: string }

function codeToEmoji(code: string): string {
  const c = code.toUpperCase()
  if (c.length !== 2) return ""
  const base = 0x1f1e6
  return String.fromCodePoint(base + c.charCodeAt(0) - 65, base + c.charCodeAt(1) - 65)
}

export const COUNTRIES: CountryOption[] = [
  { code: "AF", name: "Afganistán", emoji: codeToEmoji("AF") },
  { code: "AL", name: "Albania", emoji: codeToEmoji("AL") },
  { code: "DE", name: "Alemania", emoji: codeToEmoji("DE") },
  { code: "AD", name: "Andorra", emoji: codeToEmoji("AD") },
  { code: "AO", name: "Angola", emoji: codeToEmoji("AO") },
  { code: "AI", name: "Anguila", emoji: codeToEmoji("AI") },
  { code: "AQ", name: "Antártida", emoji: codeToEmoji("AQ") },
  { code: "AG", name: "Antigua y Barbuda", emoji: codeToEmoji("AG") },
  { code: "SA", name: "Arabia Saudí", emoji: codeToEmoji("SA") },
  { code: "DZ", name: "Argelia", emoji: codeToEmoji("DZ") },
  { code: "AR", name: "Argentina", emoji: codeToEmoji("AR") },
  { code: "AM", name: "Armenia", emoji: codeToEmoji("AM") },
  { code: "AW", name: "Aruba", emoji: codeToEmoji("AW") },
  { code: "AU", name: "Australia", emoji: codeToEmoji("AU") },
  { code: "AT", name: "Austria", emoji: codeToEmoji("AT") },
  { code: "AZ", name: "Azerbaiyán", emoji: codeToEmoji("AZ") },
  { code: "BS", name: "Bahamas", emoji: codeToEmoji("BS") },
  { code: "BD", name: "Bangladés", emoji: codeToEmoji("BD") },
  { code: "BB", name: "Barbados", emoji: codeToEmoji("BB") },
  { code: "BH", name: "Baréin", emoji: codeToEmoji("BH") },
  { code: "BE", name: "Bélgica", emoji: codeToEmoji("BE") },
  { code: "BZ", name: "Belice", emoji: codeToEmoji("BZ") },
  { code: "BJ", name: "Benín", emoji: codeToEmoji("BJ") },
  { code: "BM", name: "Bermudas", emoji: codeToEmoji("BM") },
  { code: "BY", name: "Bielorrusia", emoji: codeToEmoji("BY") },
  { code: "BO", name: "Bolivia", emoji: codeToEmoji("BO") },
  { code: "BA", name: "Bosnia y Herzegovina", emoji: codeToEmoji("BA") },
  { code: "BW", name: "Botsuana", emoji: codeToEmoji("BW") },
  { code: "BR", name: "Brasil", emoji: codeToEmoji("BR") },
  { code: "BN", name: "Brunéi", emoji: codeToEmoji("BN") },
  { code: "BG", name: "Bulgaria", emoji: codeToEmoji("BG") },
  { code: "BF", name: "Burkina Faso", emoji: codeToEmoji("BF") },
  { code: "BI", name: "Burundi", emoji: codeToEmoji("BI") },
  { code: "BT", name: "Bután", emoji: codeToEmoji("BT") },
  { code: "CV", name: "Cabo Verde", emoji: codeToEmoji("CV") },
  { code: "KH", name: "Camboya", emoji: codeToEmoji("KH") },
  { code: "CM", name: "Camerún", emoji: codeToEmoji("CM") },
  { code: "CA", name: "Canadá", emoji: codeToEmoji("CA") },
  { code: "BQ", name: "Caribe neerlandés", emoji: codeToEmoji("BQ") },
  { code: "QA", name: "Catar", emoji: codeToEmoji("QA") },
  { code: "TD", name: "Chad", emoji: codeToEmoji("TD") },
  { code: "CZ", name: "Chequia", emoji: codeToEmoji("CZ") },
  { code: "CL", name: "Chile", emoji: codeToEmoji("CL") },
  { code: "CN", name: "China", emoji: codeToEmoji("CN") },
  { code: "CY", name: "Chipre", emoji: codeToEmoji("CY") },
  { code: "VA", name: "Ciudad del Vaticano", emoji: codeToEmoji("VA") },
  { code: "CO", name: "Colombia", emoji: codeToEmoji("CO") },
  { code: "KM", name: "Comoras", emoji: codeToEmoji("KM") },
  { code: "CG", name: "Congo", emoji: codeToEmoji("CG") },
  { code: "KP", name: "Corea del Norte", emoji: codeToEmoji("KP") },
  { code: "KR", name: "Corea del Sur", emoji: codeToEmoji("KR") },
  { code: "CR", name: "Costa Rica", emoji: codeToEmoji("CR") },
  { code: "CI", name: "Côte d’Ivoire", emoji: codeToEmoji("CI") },
  { code: "HR", name: "Croacia", emoji: codeToEmoji("HR") },
  { code: "CU", name: "Cuba", emoji: codeToEmoji("CU") },
  { code: "CW", name: "Curazao", emoji: codeToEmoji("CW") },
  { code: "DK", name: "Dinamarca", emoji: codeToEmoji("DK") },
  { code: "DM", name: "Dominica", emoji: codeToEmoji("DM") },
  { code: "EC", name: "Ecuador", emoji: codeToEmoji("EC") },
  { code: "EG", name: "Egipto", emoji: codeToEmoji("EG") },
  { code: "SV", name: "El Salvador", emoji: codeToEmoji("SV") },
  { code: "AE", name: "Emiratos Árabes Unidos", emoji: codeToEmoji("AE") },
  { code: "ER", name: "Eritrea", emoji: codeToEmoji("ER") },
  { code: "SK", name: "Eslovaquia", emoji: codeToEmoji("SK") },
  { code: "SI", name: "Eslovenia", emoji: codeToEmoji("SI") },
  { code: "ES", name: "España", emoji: codeToEmoji("ES") },
  { code: "US", name: "Estados Unidos", emoji: codeToEmoji("US") },
  { code: "EE", name: "Estonia", emoji: codeToEmoji("EE") },
  { code: "SZ", name: "Esuatini", emoji: codeToEmoji("SZ") },
  { code: "ET", name: "Etiopía", emoji: codeToEmoji("ET") },
  { code: "PH", name: "Filipinas", emoji: codeToEmoji("PH") },
  { code: "FI", name: "Finlandia", emoji: codeToEmoji("FI") },
  { code: "FJ", name: "Fiyi", emoji: codeToEmoji("FJ") },
  { code: "FR", name: "Francia", emoji: codeToEmoji("FR") },
  { code: "GA", name: "Gabón", emoji: codeToEmoji("GA") },
  { code: "GM", name: "Gambia", emoji: codeToEmoji("GM") },
  { code: "GE", name: "Georgia", emoji: codeToEmoji("GE") },
  { code: "GH", name: "Ghana", emoji: codeToEmoji("GH") },
  { code: "GI", name: "Gibraltar", emoji: codeToEmoji("GI") },
  { code: "GD", name: "Granada", emoji: codeToEmoji("GD") },
  { code: "GR", name: "Grecia", emoji: codeToEmoji("GR") },
  { code: "GL", name: "Groenlandia", emoji: codeToEmoji("GL") },
  { code: "GP", name: "Guadalupe", emoji: codeToEmoji("GP") },
  { code: "GU", name: "Guam", emoji: codeToEmoji("GU") },
  { code: "GT", name: "Guatemala", emoji: codeToEmoji("GT") },
  { code: "GF", name: "Guayana Francesa", emoji: codeToEmoji("GF") },
  { code: "GG", name: "Guernsey", emoji: codeToEmoji("GG") },
  { code: "GN", name: "Guinea", emoji: codeToEmoji("GN") },
  { code: "GQ", name: "Guinea Ecuatorial", emoji: codeToEmoji("GQ") },
  { code: "GW", name: "Guinea-Bisáu", emoji: codeToEmoji("GW") },
  { code: "GY", name: "Guyana", emoji: codeToEmoji("GY") },
  { code: "HT", name: "Haití", emoji: codeToEmoji("HT") },
  { code: "HN", name: "Honduras", emoji: codeToEmoji("HN") },
  { code: "HU", name: "Hungría", emoji: codeToEmoji("HU") },
  { code: "IN", name: "India", emoji: codeToEmoji("IN") },
  { code: "ID", name: "Indonesia", emoji: codeToEmoji("ID") },
  { code: "IQ", name: "Irak", emoji: codeToEmoji("IQ") },
  { code: "IR", name: "Irán", emoji: codeToEmoji("IR") },
  { code: "IE", name: "Irlanda", emoji: codeToEmoji("IE") },
  { code: "BV", name: "Isla Bouvet", emoji: codeToEmoji("BV") },
  { code: "IM", name: "Isla de Man", emoji: codeToEmoji("IM") },
  { code: "CX", name: "Isla de Navidad", emoji: codeToEmoji("CX") },
  { code: "NF", name: "Isla Norfolk", emoji: codeToEmoji("NF") },
  { code: "IS", name: "Islandia", emoji: codeToEmoji("IS") },
  { code: "AX", name: "Islas Åland", emoji: codeToEmoji("AX") },
  { code: "KY", name: "Islas Caimán", emoji: codeToEmoji("KY") },
  { code: "CC", name: "Islas Cocos", emoji: codeToEmoji("CC") },
  { code: "CK", name: "Islas Cook", emoji: codeToEmoji("CK") },
  { code: "FO", name: "Islas Feroe", emoji: codeToEmoji("FO") },
  { code: "GS", name: "Islas Georgia del Sur y Sandwich del Sur", emoji: codeToEmoji("GS") },
  { code: "HM", name: "Islas Heard y McDonald", emoji: codeToEmoji("HM") },
  { code: "FK", name: "Islas Malvinas", emoji: codeToEmoji("FK") },
  { code: "MP", name: "Islas Marianas del Norte", emoji: codeToEmoji("MP") },
  { code: "MH", name: "Islas Marshall", emoji: codeToEmoji("MH") },
  { code: "UM", name: "Islas menores alejadas de EE. UU.", emoji: codeToEmoji("UM") },
  { code: "PN", name: "Islas Pitcairn", emoji: codeToEmoji("PN") },
  { code: "SB", name: "Islas Salomón", emoji: codeToEmoji("SB") },
  { code: "TC", name: "Islas Turcas y Caicos", emoji: codeToEmoji("TC") },
  { code: "VG", name: "Islas Vírgenes Británicas", emoji: codeToEmoji("VG") },
  { code: "VI", name: "Islas Vírgenes de EE. UU.", emoji: codeToEmoji("VI") },
  { code: "IL", name: "Israel", emoji: codeToEmoji("IL") },
  { code: "IT", name: "Italia", emoji: codeToEmoji("IT") },
  { code: "JM", name: "Jamaica", emoji: codeToEmoji("JM") },
  { code: "JP", name: "Japón", emoji: codeToEmoji("JP") },
  { code: "JE", name: "Jersey", emoji: codeToEmoji("JE") },
  { code: "JO", name: "Jordania", emoji: codeToEmoji("JO") },
  { code: "KZ", name: "Kazajistán", emoji: codeToEmoji("KZ") },
  { code: "KE", name: "Kenia", emoji: codeToEmoji("KE") },
  { code: "KG", name: "Kirguistán", emoji: codeToEmoji("KG") },
  { code: "KI", name: "Kiribati", emoji: codeToEmoji("KI") },
  { code: "KW", name: "Kuwait", emoji: codeToEmoji("KW") },
  { code: "LA", name: "Laos", emoji: codeToEmoji("LA") },
  { code: "LS", name: "Lesoto", emoji: codeToEmoji("LS") },
  { code: "LV", name: "Letonia", emoji: codeToEmoji("LV") },
  { code: "LB", name: "Líbano", emoji: codeToEmoji("LB") },
  { code: "LR", name: "Liberia", emoji: codeToEmoji("LR") },
  { code: "LY", name: "Libia", emoji: codeToEmoji("LY") },
  { code: "LI", name: "Liechtenstein", emoji: codeToEmoji("LI") },
  { code: "LT", name: "Lituania", emoji: codeToEmoji("LT") },
  { code: "LU", name: "Luxemburgo", emoji: codeToEmoji("LU") },
  { code: "MK", name: "Macedonia del Norte", emoji: codeToEmoji("MK") },
  { code: "MG", name: "Madagascar", emoji: codeToEmoji("MG") },
  { code: "MY", name: "Malasia", emoji: codeToEmoji("MY") },
  { code: "MW", name: "Malaui", emoji: codeToEmoji("MW") },
  { code: "MV", name: "Maldivas", emoji: codeToEmoji("MV") },
  { code: "ML", name: "Mali", emoji: codeToEmoji("ML") },
  { code: "MT", name: "Malta", emoji: codeToEmoji("MT") },
  { code: "MA", name: "Marruecos", emoji: codeToEmoji("MA") },
  { code: "MQ", name: "Martinica", emoji: codeToEmoji("MQ") },
  { code: "MU", name: "Mauricio", emoji: codeToEmoji("MU") },
  { code: "MR", name: "Mauritania", emoji: codeToEmoji("MR") },
  { code: "YT", name: "Mayotte", emoji: codeToEmoji("YT") },
  { code: "MX", name: "México", emoji: codeToEmoji("MX") },
  { code: "FM", name: "Micronesia", emoji: codeToEmoji("FM") },
  { code: "MD", name: "Moldavia", emoji: codeToEmoji("MD") },
  { code: "MC", name: "Mónaco", emoji: codeToEmoji("MC") },
  { code: "MN", name: "Mongolia", emoji: codeToEmoji("MN") },
  { code: "ME", name: "Montenegro", emoji: codeToEmoji("ME") },
  { code: "MS", name: "Montserrat", emoji: codeToEmoji("MS") },
  { code: "MZ", name: "Mozambique", emoji: codeToEmoji("MZ") },
  { code: "MM", name: "Myanmar (Birmania)", emoji: codeToEmoji("MM") },
  { code: "NA", name: "Namibia", emoji: codeToEmoji("NA") },
  { code: "NR", name: "Nauru", emoji: codeToEmoji("NR") },
  { code: "NP", name: "Nepal", emoji: codeToEmoji("NP") },
  { code: "NI", name: "Nicaragua", emoji: codeToEmoji("NI") },
  { code: "NE", name: "Níger", emoji: codeToEmoji("NE") },
  { code: "NG", name: "Nigeria", emoji: codeToEmoji("NG") },
  { code: "NU", name: "Niue", emoji: codeToEmoji("NU") },
  { code: "NO", name: "Noruega", emoji: codeToEmoji("NO") },
  { code: "NC", name: "Nueva Caledonia", emoji: codeToEmoji("NC") },
  { code: "NZ", name: "Nueva Zelanda", emoji: codeToEmoji("NZ") },
  { code: "OM", name: "Omán", emoji: codeToEmoji("OM") },
  { code: "NL", name: "Países Bajos", emoji: codeToEmoji("NL") },
  { code: "PK", name: "Pakistán", emoji: codeToEmoji("PK") },
  { code: "PW", name: "Palaos", emoji: codeToEmoji("PW") },
  { code: "PA", name: "Panamá", emoji: codeToEmoji("PA") },
  { code: "PG", name: "Papúa Nueva Guinea", emoji: codeToEmoji("PG") },
  { code: "PY", name: "Paraguay", emoji: codeToEmoji("PY") },
  { code: "PE", name: "Perú", emoji: codeToEmoji("PE") },
  { code: "PF", name: "Polinesia Francesa", emoji: codeToEmoji("PF") },
  { code: "PL", name: "Polonia", emoji: codeToEmoji("PL") },
  { code: "PT", name: "Portugal", emoji: codeToEmoji("PT") },
  { code: "PR", name: "Puerto Rico", emoji: codeToEmoji("PR") },
  { code: "HK", name: "RAE de Hong Kong (China)", emoji: codeToEmoji("HK") },
  { code: "MO", name: "RAE de Macao (China)", emoji: codeToEmoji("MO") },
  { code: "GB", name: "Reino Unido", emoji: codeToEmoji("GB") },
  { code: "CF", name: "República Centroafricana", emoji: codeToEmoji("CF") },
  { code: "CD", name: "República Democrática del Congo", emoji: codeToEmoji("CD") },
  { code: "DO", name: "República Dominicana", emoji: codeToEmoji("DO") },
  { code: "RE", name: "Reunión", emoji: codeToEmoji("RE") },
  { code: "RW", name: "Ruanda", emoji: codeToEmoji("RW") },
  { code: "RO", name: "Rumanía", emoji: codeToEmoji("RO") },
  { code: "RU", name: "Rusia", emoji: codeToEmoji("RU") },
  { code: "EH", name: "Sáhara Occidental", emoji: codeToEmoji("EH") },
  { code: "WS", name: "Samoa", emoji: codeToEmoji("WS") },
  { code: "AS", name: "Samoa Americana", emoji: codeToEmoji("AS") },
  { code: "BL", name: "San Bartolomé", emoji: codeToEmoji("BL") },
  { code: "KN", name: "San Cristóbal y Nieves", emoji: codeToEmoji("KN") },
  { code: "SM", name: "San Marino", emoji: codeToEmoji("SM") },
  { code: "MF", name: "San Martín", emoji: codeToEmoji("MF") },
  { code: "PM", name: "San Pedro y Miquelón", emoji: codeToEmoji("PM") },
  { code: "VC", name: "San Vicente y las Granadinas", emoji: codeToEmoji("VC") },
  { code: "SH", name: "Santa Elena", emoji: codeToEmoji("SH") },
  { code: "LC", name: "Santa Lucía", emoji: codeToEmoji("LC") },
  { code: "ST", name: "Santo Tomé y Príncipe", emoji: codeToEmoji("ST") },
  { code: "SN", name: "Senegal", emoji: codeToEmoji("SN") },
  { code: "RS", name: "Serbia", emoji: codeToEmoji("RS") },
  { code: "SC", name: "Seychelles", emoji: codeToEmoji("SC") },
  { code: "SL", name: "Sierra Leona", emoji: codeToEmoji("SL") },
  { code: "SG", name: "Singapur", emoji: codeToEmoji("SG") },
  { code: "SX", name: "Sint Maarten", emoji: codeToEmoji("SX") },
  { code: "SY", name: "Siria", emoji: codeToEmoji("SY") },
  { code: "SO", name: "Somalia", emoji: codeToEmoji("SO") },
  { code: "LK", name: "Sri Lanka", emoji: codeToEmoji("LK") },
  { code: "ZA", name: "Sudáfrica", emoji: codeToEmoji("ZA") },
  { code: "SD", name: "Sudán", emoji: codeToEmoji("SD") },
  { code: "SS", name: "Sudán del Sur", emoji: codeToEmoji("SS") },
  { code: "SE", name: "Suecia", emoji: codeToEmoji("SE") },
  { code: "CH", name: "Suiza", emoji: codeToEmoji("CH") },
  { code: "SR", name: "Surinam", emoji: codeToEmoji("SR") },
  { code: "SJ", name: "Svalbard y Jan Mayen", emoji: codeToEmoji("SJ") },
  { code: "TH", name: "Tailandia", emoji: codeToEmoji("TH") },
  { code: "TW", name: "Taiwán", emoji: codeToEmoji("TW") },
  { code: "TZ", name: "Tanzania", emoji: codeToEmoji("TZ") },
  { code: "TJ", name: "Tayikistán", emoji: codeToEmoji("TJ") },
  { code: "IO", name: "Territorio Británico del Océano Índico", emoji: codeToEmoji("IO") },
  { code: "TF", name: "Territorios Australes Franceses", emoji: codeToEmoji("TF") },
  { code: "PS", name: "Territorios Palestinos", emoji: codeToEmoji("PS") },
  { code: "TL", name: "Timor-Leste", emoji: codeToEmoji("TL") },
  { code: "TG", name: "Togo", emoji: codeToEmoji("TG") },
  { code: "TK", name: "Tokelau", emoji: codeToEmoji("TK") },
  { code: "TO", name: "Tonga", emoji: codeToEmoji("TO") },
  { code: "TT", name: "Trinidad y Tobago", emoji: codeToEmoji("TT") },
  { code: "TN", name: "Túnez", emoji: codeToEmoji("TN") },
  { code: "TM", name: "Turkmenistán", emoji: codeToEmoji("TM") },
  { code: "TR", name: "Turquía", emoji: codeToEmoji("TR") },
  { code: "TV", name: "Tuvalu", emoji: codeToEmoji("TV") },
  { code: "UA", name: "Ucrania", emoji: codeToEmoji("UA") },
  { code: "UG", name: "Uganda", emoji: codeToEmoji("UG") },
  { code: "UY", name: "Uruguay", emoji: codeToEmoji("UY") },
  { code: "UZ", name: "Uzbekistán", emoji: codeToEmoji("UZ") },
  { code: "VU", name: "Vanuatu", emoji: codeToEmoji("VU") },
  { code: "VE", name: "Venezuela", emoji: codeToEmoji("VE") },
  { code: "VN", name: "Vietnam", emoji: codeToEmoji("VN") },
  { code: "WF", name: "Wallis y Futuna", emoji: codeToEmoji("WF") },
  { code: "YE", name: "Yemen", emoji: codeToEmoji("YE") },
  { code: "DJ", name: "Yibuti", emoji: codeToEmoji("DJ") },
  { code: "ZM", name: "Zambia", emoji: codeToEmoji("ZM") },
  { code: "ZW", name: "Zimbabue", emoji: codeToEmoji("ZW") },
]

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]))

export function getCountryByCode(code: string): CountryOption | undefined {
  return byCode.get(code.toUpperCase())
}

export function countryLabel(code: string): string {
  const c = getCountryByCode(code)
  if (!c) return code
  return `${c.emoji} ${c.name}`
}

/** Nombres en texto plano separados por coma (p. ej. accesible `alt` de imagen). */
export function countriesPlainList(codes: string[]): string {
  if (codes.length === 0) return ""
  return codes
    .map((code) => getCountryByCode(code)?.name ?? code)
    .filter(Boolean)
    .join(", ")
}

/**
 * Nombres en inglés frecuentes en blog / LLM; el listado COUNTRIES usa español.
 * Clave: minúsculas, sin tildes si el nombre EN va sin ellas.
 */
const COUNTRY_EXONYM_TO_CODE: Record<string, string> = {
  kenya: "KE",
  tanzania: "TZ",
  rwanda: "RW",
  uganda: "UG",
  namibia: "NA",
  botswana: "BW",
  zambia: "ZM",
  zimbabwe: "ZW",
  malawi: "MW",
  mozambique: "MZ",
  ethiopia: "ET",
  egypt: "EG",
  morocco: "MA",
  oman: "OM",
  nepal: "NP",
  bhutan: "BT",
  laos: "LA",
  cambodia: "KH",
  "south sudan": "SS",
  "sri lanka": "LK",
}

/**
 * Extrae códigos ISO-3166 alpha-2 (minúsculas) desde regiones/destino para filtrar geocodificación
 * (p. ej. "Murchison Falls NP, Uganda" → "ug", evitando resultados en India o EEUU).
 */
export function collectCountryCodesFromHint(hint: string | null | undefined): string[] {
  if (!hint?.trim()) return []
  const found = new Set<string>()

  const addCode = (iso: string) => {
    if (iso.length === 2) found.add(iso.toLowerCase())
  }

  const fromSegment = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    const tL = t.toLowerCase()

    if (COUNTRY_EXONYM_TO_CODE[tL]) {
      addCode(COUNTRY_EXONYM_TO_CODE[tL]!)
      return
    }

    for (const c of COUNTRIES) {
      if (c.name.toLowerCase() === tL) {
        addCode(c.code)
        return
      }
    }

    for (const c of COUNTRIES) {
      const n = c.name.toLowerCase()
      if (n.length < 4) continue
      if (tL === n || tL.startsWith(`${n} `) || tL.startsWith(`norte de ${n}`) || tL.endsWith(` ${n}`)) {
        addCode(c.code)
        return
      }
    }
    for (const [w, code] of Object.entries(COUNTRY_EXONYM_TO_CODE)) {
      if (w.length < 4) continue
      if (tL === w || tL === `norte de ${w}` || tL.endsWith(` ${w}`)) {
        addCode(code)
        return
      }
    }
  }

  fromSegment(hint)
  for (const seg of hint.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    fromSegment(seg)
  }
  if (found.size === 0) {
    const t = hint.toLowerCase()
    for (const c of COUNTRIES) {
      const n = c.name.toLowerCase()
      if (n.length < 4) continue
      if (t === n || t.endsWith(`, ${n}`) || t.endsWith(`, ${n} `) || t.includes(`, ${n},`) || t.includes(`, ${n}(`)) {
        addCode(c.code)
      }
    }
  }

  return [...found]
}

/**
 * Códigos ISO (mayúsculas) para el asistente / fichas MAE.
 * Usa `trip.countries` si hay; si no, infiere del nombre del viaje, `source.area` y regiones.
 * (Hoy `createTrip` guarda `countries: []`, así que sin esto la ficha país no se precarga.)
 */
export function resolveTripCountryCodes(
  trip: { name: string; countries?: string[] | null; days?: { items: { region?: string | null }[] }[] },
  sources: { area?: string | null; items?: { region?: string | null }[] }[] = [],
): string[] {
  const explicit = (trip.countries ?? [])
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length === 2)
  if (explicit.length > 0) return [...new Set(explicit)]

  const found = new Set<string>()
  const hints: string[] = [trip.name]
  for (const s of sources) {
    if (s.area) hints.push(s.area)
    for (const it of s.items ?? []) {
      if (it.region) hints.push(it.region)
    }
  }
  for (const day of trip.days ?? []) {
    for (const it of day.items) {
      if (it.region) hints.push(it.region)
    }
  }
  for (const hint of hints) {
    for (const code of collectCountryCodesFromHint(hint)) {
      found.add(code.toUpperCase())
    }
  }

  // Nombre suelto en texto largo: "viaje a Uganda", "Uganda 2026"…
  if (found.size === 0) {
    const blob = hints.join(" ").toLowerCase()
    for (const c of COUNTRIES) {
      const n = c.name.toLowerCase()
      if (n.length < 4) continue
      if (blob.includes(n)) found.add(c.code.toUpperCase())
    }
    for (const [word, code] of Object.entries(COUNTRY_EXONYM_TO_CODE)) {
      if (word.length < 4) continue
      if (blob.includes(word)) found.add(code.toUpperCase())
    }
  }

  return [...found]
}
