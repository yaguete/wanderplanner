import assert from "node:assert/strict"
import {
  dateISOForDayIndex,
  daysBetweenInclusive,
  endDateFromStartAndNumDays,
  formatAddedDaysCompact,
  formatDayDate,
  formatDayDateShort,
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

// Formato de cabecera de día (weekday + día + mes, sin año).
assert.equal(formatDayDate("2026-09-14"), "lun 14 sept") // lunes
assert.equal(formatDayDate("2026-08-09"), "dom 9 ago")

// Selector de día: sin weekday, para caber en el combobox.
assert.equal(formatDayDateShort("2026-08-29"), "29 ago")
assert.equal(formatDayDateShort("2026-09-14"), "14 sept")
assert.equal(formatDayDateShort(null), null)

// Badge de ítem ya añadido: rachas consecutivas se colapsan.
assert.equal(formatAddedDaysCompact([]), "")
assert.equal(formatAddedDaysCompact([1], "2026-12-28"), "lun 28 dic")
assert.equal(
  formatAddedDaysCompact([1, 2, 3, 4, 5], "2026-12-28"),
  "lun 28 dic a vie 1 ene",
)
assert.equal(formatAddedDaysCompact([1, 4], "2026-12-28"), "lun 28 dic, jue 31 dic")
assert.equal(
  formatAddedDaysCompact([1, 2, 5], "2026-12-28"),
  "lun 28 dic a mar 29 dic, vie 1 ene",
)
assert.equal(formatAddedDaysCompact([5, 1, 2, 2], "2026-12-28"), "lun 28 dic a mar 29 dic, vie 1 ene")
assert.equal(formatAddedDaysCompact([1, 2, 3], null), "Día 1 a Día 3")
assert.equal(formatAddedDaysCompact([1, 4]), "Día 1, Día 4")

// Añadir un día al viaje de aceptación: 14–20 → 14–21.
assert.equal(endDateFromStartAndNumDays("2026-09-14", 8), "2026-09-21")
assert.equal(dateISOForDayIndex("2026-09-14", 7), "2026-09-21")

console.log("trip-dates: ok")
