#!/usr/bin/env node
/**
 * Genera frontend/lib/airports-data.ts desde OurAirports.
 * Se ejecuta a mano; nunca en build ni en runtime.
 *
 * Fuente: https://davidmegginson.github.io/ourairports-data/airports.csv
 * Filtro: type ∈ large_airport|medium_airport, scheduled_service=yes,
 * iata_code de exactamente 3 letras A-Z.
 *
 * Uso: node scripts/generate-airports.mjs
 */
import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SOURCE_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
const OUT_REL = "../frontend/lib/airports-data.ts"
const TYPES = new Set(["large_airport", "medium_airport"])

const root = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(root, OUT_REL)

function parseCsvLine(line) {
  const cells = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      cells.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells
}

function fmtCoord(n) {
  return Number(n).toFixed(2)
}

const res = await fetch(SOURCE_URL)
if (!res.ok) {
  throw new Error(`OurAirports HTTP ${res.status}`)
}
const csv = await res.text()
const lines = csv.split(/\r?\n/)
if (lines.length < 2) throw new Error("CSV vacío")

const header = parseCsvLine(lines[0])
const idx = (name) => {
  const i = header.indexOf(name)
  if (i < 0) throw new Error(`Columna ausente: ${name}`)
  return i
}
const iType = idx("type")
const iLat = idx("latitude_deg")
const iLng = idx("longitude_deg")
const iSched = idx("scheduled_service")
const iIata = idx("iata_code")

/** @type {Map<string, { type: string, lng: number, lat: number }>} */
const byIata = new Map()
let scanned = 0
for (let n = 1; n < lines.length; n++) {
  const line = lines[n]
  if (!line) continue
  scanned++
  const cells = parseCsvLine(line)
  const type = cells[iType] ?? ""
  if (!TYPES.has(type)) continue
  if ((cells[iSched] ?? "").toLowerCase() !== "yes") continue
  const iata = (cells[iIata] ?? "").trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(iata)) continue
  const lat = Number(cells[iLat])
  const lng = Number(cells[iLng])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue
  const prev = byIata.get(iata)
  if (prev && prev.type === "large_airport" && type !== "large_airport") continue
  byIata.set(iata, { type, lng, lat })
}

const packed = [...byIata.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([iata, a]) => `${iata}${fmtCoord(a.lng)},${fmtCoord(a.lat)}`)
  .join("|")

const generatedAt = new Date().toISOString().slice(0, 10)
const body = `/**
 * Tabla IATA compacta generada — NO editar a mano.
 * Regenerar: \`node scripts/generate-airports.mjs\`
 *
 * Fuente: ${SOURCE_URL}
 * Generado: ${generatedAt}
 * Filtro: type ∈ large_airport|medium_airport, scheduled_service=yes, iata_code [A-Z]{3}
 * Filas: ${byIata.size} (de ${scanned} aeropuertos en el CSV)
 *
 * Formato: "IATAlng,lat|…" con 2 decimales (~1,1 km). Se parsea en airports.ts.
 */
export const AIRPORTS_PACKED =
  ${JSON.stringify(packed)}
`

writeFileSync(outPath, body)
console.log(`Wrote ${byIata.size} airports → ${outPath} (${packed.length} chars)`)
