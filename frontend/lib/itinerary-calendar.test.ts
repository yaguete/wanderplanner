import assert from "node:assert/strict"
import {
  buildCalendarGrid,
  calendarBadgeLabel,
  clipBadges,
  dayIndexForISO,
  densityFor,
  DENSITY_WIDE_PX,
  DENSITY_MD_PX,
  monthBadgeCap,
  MONTH_CELL_CHROME_PX,
  BADGE_SLOT_PX,
  initialAnchorISO,
  isoByDayIndex,
  shiftAnchor,
  weekdayHeader,
} from "./itinerary-calendar"

function cellByIso(
  weeks: ReturnType<typeof buildCalendarGrid>["weeks"],
  iso: string,
) {
  for (const week of weeks) {
    const hit = week.find((c) => c.iso === iso)
    if (hit) return hit
  }
  return undefined
}

function flat(weeks: ReturnType<typeof buildCalendarGrid>["weeks"]) {
  return weeks.flat()
}

// Cabecera lunes–domingo, con tildes y sin punto.
const header = weekdayHeader()
assert.deepEqual(header, ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"])

// Marzo 2026: 1 = domingo → 6 semanas (23 feb – 5 abr).
const mar = buildCalendarGrid({
  scale: "month",
  anchorISO: "2026-03-15",
  startDate: null,
  numDays: 0,
  todayISO: "2026-03-15",
})
assert.equal(mar.caption, "marzo 2026")
assert.equal(mar.weeks.length, 6)
assert.equal(mar.weeks[0]![0]!.iso, "2026-02-23")
assert.equal(mar.weeks[0]![0]!.inMonth, false)
assert.equal(mar.weeks[0]![6]!.iso, "2026-03-01")
assert.equal(mar.weeks[0]![6]!.inMonth, true)
assert.equal(mar.weeks[5]![6]!.iso, "2026-04-05")
assert.equal(mar.weeks[5]![6]!.inMonth, false)
assert.equal(mar.intersectsTrip, false)

// Junio 2026: 1 = lunes → 5 semanas.
const jun = buildCalendarGrid({
  scale: "month",
  anchorISO: "2026-06-10",
  startDate: "2026-06-01",
  numDays: 1,
  todayISO: "2026-01-01",
})
assert.equal(jun.weeks.length, 5)
assert.equal(jun.weeks[0]![0]!.iso, "2026-06-01")
assert.equal(jun.weeks[0]![0]!.inMonth, true)
assert.equal(jun.weeks[0]![0]!.dayIndex, 0)
assert.equal(jun.weeks[0]![0]!.isTripStart, true)
assert.equal(jun.weeks[0]![0]!.isTripEnd, true)
assert.equal(jun.weeks[0]![0]!.isRangeStart, true)
assert.equal(jun.weeks[0]![0]!.isRangeEnd, true)
assert.equal(jun.intersectsTrip, true)

// Viaje de 60 días a caballo de dos meses y del año.
const longStart = "2026-11-20"
const nov = buildCalendarGrid({
  scale: "month",
  anchorISO: "2026-11-20",
  startDate: longStart,
  numDays: 60,
  todayISO: "2026-12-15",
})
assert.equal(dayIndexForISO(longStart, 60, "2026-11-20"), 0)
assert.equal(dayIndexForISO(longStart, 60, "2027-01-18"), 59)
assert.equal(dayIndexForISO(longStart, 60, "2027-01-19"), null)
assert.equal(cellByIso(nov.weeks, "2026-11-20")?.isTripStart, true)
assert.equal(nov.intersectsTrip, true)

const long = buildCalendarGrid({
  scale: "month",
  anchorISO: "2026-12-01",
  startDate: longStart,
  numDays: 60,
  todayISO: "2026-12-15",
})
assert.equal(cellByIso(long.weeks, "2026-12-01")?.dayIndex, 11)
assert.equal(long.intersectsTrip, true)

const jan = buildCalendarGrid({
  scale: "month",
  anchorISO: "2027-01-01",
  startDate: longStart,
  numDays: 60,
  todayISO: "2026-12-15",
})
assert.equal(cellByIso(jan.weeks, "2027-01-18")?.dayIndex, 59)
assert.equal(cellByIso(jan.weeks, "2027-01-18")?.isTripEnd, true)
assert.equal(cellByIso(jan.weeks, "2027-01-19")?.dayIndex, null)

// El mapa día→fecha sale de days.length, no de endDate.
assert.deepEqual(isoByDayIndex("2026-09-14", 7), [
  "2026-09-14",
  "2026-09-15",
  "2026-09-16",
  "2026-09-17",
  "2026-09-18",
  "2026-09-19",
  "2026-09-20",
])

// Semana a caballo de mes: caption reutiliza formatTripDates.
const weekCross = buildCalendarGrid({
  scale: "week",
  anchorISO: "2026-08-31",
  startDate: "2026-08-28",
  numDays: 7,
  todayISO: "2026-08-16",
})
assert.equal(weekCross.weeks.length, 1)
assert.equal(weekCross.weeks[0]!.length, 7)
assert.equal(weekCross.weeks[0]![0]!.iso, "2026-08-31")
assert.equal(weekCross.weeks[0]![6]!.iso, "2026-09-06")
assert.equal(weekCross.caption, "31 ago – 6 sept 2026")

const weekSameMonth = buildCalendarGrid({
  scale: "week",
  anchorISO: "2026-08-24",
  startDate: "2026-08-24",
  numDays: 7,
  todayISO: "2026-08-16",
})
assert.equal(weekSameMonth.caption, "24–30 ago 2026")

// Caption de mes sin «de».
assert.equal(
  buildCalendarGrid({
    scale: "month",
    anchorISO: "2026-08-01",
    startDate: null,
    numDays: 0,
    todayISO: "2026-08-16",
  }).caption,
  "agosto 2026",
)

// isRangeStart/End en cortes de semana y extremos del viaje.
// Viaje mié 26 ago – vie 4 sep (10 días): corte domingo 30 / lunes 31.
const band = buildCalendarGrid({
  scale: "month",
  anchorISO: "2026-08-26",
  startDate: "2026-08-26",
  numDays: 10,
  todayISO: "2026-08-16",
})
const wed26 = cellByIso(band.weeks, "2026-08-26")!
assert.equal(wed26.dayIndex, 0)
assert.equal(wed26.isTripStart, true)
assert.equal(wed26.isRangeStart, true)
assert.equal(wed26.isRangeEnd, false)

const sun30 = cellByIso(band.weeks, "2026-08-30")!
assert.equal(sun30.dayIndex, 4)
assert.equal(sun30.isRangeEnd, true)
assert.equal(sun30.isRangeStart, false)
assert.equal(sun30.isTripEnd, false)

const mon31 = cellByIso(band.weeks, "2026-08-31")!
assert.equal(mon31.dayIndex, 5)
assert.equal(mon31.isRangeStart, true)
assert.equal(mon31.isRangeEnd, false)
assert.equal(mon31.isTripStart, false)

const fri4 = cellByIso(band.weeks, "2026-09-04")!
assert.equal(fri4.dayIndex, 9)
assert.equal(fri4.isTripEnd, true)
assert.equal(fri4.isRangeEnd, true)
assert.equal(fri4.inMonth, false)

const tue25 = cellByIso(band.weeks, "2026-08-25")!
assert.equal(tue25.dayIndex, null)
assert.equal(tue25.isRangeStart, false)

// Cambio de hora (último domingo de oct 2026 = 25 oct): el día N sigue siendo N.
const dst = buildCalendarGrid({
  scale: "month",
  anchorISO: "2026-10-24",
  startDate: "2026-10-24",
  numDays: 3,
  todayISO: "2026-10-01",
})
assert.equal(cellByIso(dst.weeks, "2026-10-24")?.dayIndex, 0)
assert.equal(cellByIso(dst.weeks, "2026-10-25")?.dayIndex, 1)
assert.equal(cellByIso(dst.weeks, "2026-10-26")?.dayIndex, 2)
assert.deepEqual(isoByDayIndex("2026-10-24", 3), [
  "2026-10-24",
  "2026-10-25",
  "2026-10-26",
])

// Densidad: 390 / 500 / 780.
assert.deepEqual(densityFor(390), {
  badges: "dots",
  cap: 4,
  weekLayout: "rows",
})
assert.deepEqual(densityFor(DENSITY_MD_PX - 1), {
  badges: "dots",
  cap: 4,
  weekLayout: "rows",
})
assert.deepEqual(densityFor(500), {
  badges: "text",
  cap: 2,
  weekLayout: "rows",
})
assert.deepEqual(densityFor(DENSITY_MD_PX), {
  badges: "text",
  cap: 2,
  weekLayout: "rows",
})
assert.deepEqual(densityFor(780), {
  badges: "text",
  cap: 3,
  weekLayout: "columns",
})
assert.deepEqual(densityFor(DENSITY_WIDE_PX), {
  badges: "text",
  cap: 3,
  weekLayout: "columns",
})
assert.deepEqual(densityFor(DENSITY_WIDE_PX - 1), {
  badges: "text",
  cap: 2,
  weekLayout: "rows",
})

// clipBadges: cabe entero; si no, el último hueco es "+n".
assert.deepEqual(clipBadges([], 3), { shown: [], overflow: 0 })
assert.deepEqual(clipBadges(["a", "b", "c"], 3), {
  shown: ["a", "b", "c"],
  overflow: 0,
})
assert.deepEqual(clipBadges(["a", "b", "c", "d"], 3), {
  shown: ["a", "b"],
  overflow: 2,
})
assert.deepEqual(clipBadges(["a", "b"], 1), { shown: [], overflow: 2 })
assert.deepEqual(clipBadges(["a"], 0), { shown: [], overflow: 1 })

// monthBadgeCap: recorta al alto de celda; mínimo 1 hueco.
assert.equal(monthBadgeCap(3, MONTH_CELL_CHROME_PX + BADGE_SLOT_PX * 2 + 1), 2)
assert.equal(monthBadgeCap(3, MONTH_CELL_CHROME_PX + BADGE_SLOT_PX * 4), 3)
assert.equal(monthBadgeCap(3, 40), 1)
assert.equal(monthBadgeCap(2, 0), 2)

// calendarBadgeLabel: route con/sin coma, y sin route.
assert.equal(
  calendarBadgeLabel({
    name: "Aeropuerto Josep Tarradellas Barcelona-El Prat → Vienna International Airport",
    route: {
      from: {
        label: "Aeropuerto Josep Tarradellas Barcelona-El Prat",
        coords: { lng: 0, lat: 0 },
        kind: "airport",
      },
      to: {
        label: "Vienna International Airport, Schwechat, Austria",
        coords: { lng: 0, lat: 0 },
        kind: "airport",
      },
    },
  }),
  "→ Vienna International Airport",
)
assert.equal(
  calendarBadgeLabel({
    name: "A → B",
    route: {
      from: { label: "A", coords: { lng: 0, lat: 0 }, kind: "city" },
      to: { label: "Innsbruck", coords: { lng: 0, lat: 0 }, kind: "city" },
    },
  }),
  "→ Innsbruck",
)
assert.equal(calendarBadgeLabel({ name: "Hotel Gruberhof" }), "Hotel Gruberhof")
assert.equal(
  calendarBadgeLabel({
    name: "Hertz",
    type: "transport",
    route: {
      from: { label: "Edimburgo", coords: { lng: 0, lat: 0 }, kind: "city" },
      to: { label: "Edimburgo", coords: { lng: 0, lat: 0 }, kind: "city" },
      mode: "car",
      carUse: "rental",
    },
  }),
  "Hertz",
)

// intersectsTrip false al navegar un mes fuera del viaje.
const away = buildCalendarGrid({
  scale: "month",
  anchorISO: "2026-01-01",
  startDate: "2026-08-24",
  numDays: 7,
  todayISO: "2026-08-16",
})
assert.equal(away.intersectsTrip, false)
assert.equal(flat(away.weeks).every((c) => c.dayIndex == null), true)

// Ancla inicial: hoy si cae en el viaje; si no, startDate.
assert.equal(
  initialAnchorISO({
    scale: "month",
    startDate: "2026-08-24",
    numDays: 7,
    todayISO: "2026-08-26",
  }),
  "2026-08-26",
)
assert.equal(
  initialAnchorISO({
    scale: "month",
    startDate: "2026-08-24",
    numDays: 7,
    todayISO: "2026-08-16",
  }),
  "2026-08-24",
)
assert.equal(
  initialAnchorISO({
    scale: "month",
    startDate: null,
    numDays: 0,
    todayISO: "2026-08-16",
  }),
  "2026-08-16",
)

assert.equal(shiftAnchor("2026-08-24", "month", 1), "2026-09-24")
assert.equal(shiftAnchor("2026-08-24", "month", -1), "2026-07-24")
assert.equal(shiftAnchor("2026-08-24", "week", 1), "2026-08-31")
assert.equal(shiftAnchor("2026-08-24", "week", -1), "2026-08-17")

// Hoy marcado solo cuando coincide.
const withToday = buildCalendarGrid({
  scale: "month",
  anchorISO: "2026-08-16",
  startDate: "2026-08-24",
  numDays: 7,
  todayISO: "2026-08-16",
})
assert.equal(cellByIso(withToday.weeks, "2026-08-16")?.isToday, true)
assert.equal(cellByIso(withToday.weeks, "2026-08-17")?.isToday, false)

console.log("itinerary-calendar: ok")
