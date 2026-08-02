import assert from "node:assert/strict"
import {
  dateISOForDayIndex,
  daysBetweenInclusive,
  endDateFromStartAndNumDays,
  formatDayDate,
  formatTripDates,
} from "./trip-dates"

// Off-by-one: 14 sept + 7 días → 20 sept (inclusive), no 21.
assert.equal(endDateFromStartAndNumDays("2026-09-14", 7), "2026-09-20")
assert.equal(daysBetweenInclusive("2026-09-14", "2026-09-20"), 7)
assert.equal(dateISOForDayIndex("2026-09-14", 6), "2026-09-20")

// Un solo día.
assert.equal(endDateFromStartAndNumDays("2026-09-14", 1), "2026-09-14")
assert.equal(formatTripDates("2026-09-14", "2026-09-14"), "14 sept 2026")

// Cambio de mes.
assert.equal(endDateFromStartAndNumDays("2026-09-28", 5), "2026-10-02")
assert.equal(daysBetweenInclusive("2026-09-28", "2026-10-02"), 5)

// Cambio de año.
assert.equal(endDateFromStartAndNumDays("2026-12-30", 4), "2027-01-02")

// Cruce del fin del horario de verano (Europa): 24 oct 2026 + 3 → 26 oct.
assert.equal(endDateFromStartAndNumDays("2026-10-24", 3), "2026-10-26")
assert.equal(dateISOForDayIndex("2026-10-24", 2), "2026-10-26")

// Formato de cabecera de día (sin año).
assert.equal(formatDayDate("2026-09-14"), "14 sept")

// Añadir un día al viaje de aceptación: 14–20 → 14–21.
assert.equal(endDateFromStartAndNumDays("2026-09-14", 8), "2026-09-21")
assert.equal(dateISOForDayIndex("2026-09-14", 7), "2026-09-21")

console.log("trip-dates: ok")
