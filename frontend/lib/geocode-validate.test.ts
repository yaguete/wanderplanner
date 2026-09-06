import assert from "node:assert/strict"
import { haversineMeters } from "./map-route-geometry"
import {
  anchorHitAcceptable,
  anchorQueryCore,
  anchorQueryScope,
  candidateNameMatchesQuery,
  candidatePassesAnchor,
  featureTypeFromMapboxId,
  isWeakRegionHint,
  mapsPinPassesAnchor,
  maxDistanceMetersForAnchorType,
  offsetStackedApproximate,
  pickBestAnchorHit,
  pickFirstValidCandidate,
  pickGeocodeOutcome,
  regionAnchorQueryLadder,
  sharesSignificantToken,
  type GeocodeCandidate,
  type RegionAnchor,
} from "./geocode-validate"

assert.equal(featureTypeFromMapboxId("place.123"), "place")
assert.equal(featureTypeFromMapboxId("address.abc"), "address")
assert.equal(featureTypeFromMapboxId(""), "unknown")
assert.equal(featureTypeFromMapboxId(null), "unknown")

assert.equal(maxDistanceMetersForAnchorType("place"), 25_000)
assert.equal(maxDistanceMetersForAnchorType("locality"), 15_000)
assert.equal(maxDistanceMetersForAnchorType("district"), 60_000)
assert.equal(maxDistanceMetersForAnchorType("region"), 150_000)
assert.equal(maxDistanceMetersForAnchorType("country"), null)
assert.equal(maxDistanceMetersForAnchorType("unknown"), 25_000)

const granada: RegionAnchor = {
  coord: { lng: -3.598, lat: 37.177 },
  featureType: "place",
  label: "Granada",
}
const alfacar = { coord: { lng: -3.57, lat: 37.24 }, featureType: "address" }
const salzburg = { coord: { lng: 13.055, lat: 47.809 }, featureType: "address" }
const catedralGranada = {
  coord: { lng: -3.599, lat: 37.176 },
  featureType: "poi",
  placeName: "Catedral de Granada",
}

assert.equal(candidatePassesAnchor(alfacar, granada), true) // ~8 km
assert.equal(candidatePassesAnchor(salzburg, granada), false) // 135 km+
assert.equal(candidatePassesAnchor(catedralGranada, granada), true)

// Primer válido: el POI gana a la address (especificidad).
const picked = pickFirstValidCandidate([alfacar, catedralGranada], granada)
assert.equal(picked, catedralGranada)

const innsbruck: RegionAnchor = {
  coord: { lng: 11.404, lat: 47.27 },
  featureType: "place",
  label: "Innsbruck",
}
const casaPepe = pickGeocodeOutcome(
  [{ coord: { lng: 13.04, lat: 47.8 }, featureType: "address" }],
  innsbruck,
)
assert.equal(casaPepe.precision, "approximate")
if (casaPepe.precision === "approximate") {
  assert.equal(casaPepe.anchorLabel, "Innsbruck")
  assert.equal(casaPepe.coord.lng, innsbruck.coord.lng)
}

const spain: RegionAnchor = {
  coord: { lng: -3.7, lat: 40.4 },
  featureType: "country",
  label: "Spain",
}
const murciaPoi = { coord: { lng: -1.13, lat: 37.98 }, featureType: "poi" }
assert.equal(candidatePassesAnchor(murciaPoi, spain), true)
const countryOutcome = pickGeocodeOutcome([murciaPoi], spain)
assert.equal(countryOutcome.precision, "exact")
if (countryOutcome.precision === "exact") {
  assert.equal(countryOutcome.coord.lat, murciaPoi.coord.lat)
}

assert.equal(pickGeocodeOutcome([], null).precision, "unlocated")
assert.equal(
  pickGeocodeOutcome([{ coord: { lng: 1, lat: 2 }, featureType: "poi" }], null).precision,
  "unlocated",
)
assert.equal(
  pickGeocodeOutcome(
    [{ coord: { lng: 1, lat: 2 }, featureType: "place", text: "Foo" }],
    null,
  ).precision,
  "unlocated",
)

// Un `place` dentro del radio es el centro de la ciudad, no el sitio: approximate.
const innsbruckPlace = pickGeocodeOutcome(
  [{ coord: innsbruck.coord, featureType: "place", text: "Innsbruck" }],
  innsbruck,
)
assert.equal(innsbruckPlace.precision, "approximate")
if (innsbruckPlace.precision === "approximate") {
  assert.equal(innsbruckPlace.anchorLabel, "Innsbruck")
  assert.equal(innsbruckPlace.coord.lng, innsbruck.coord.lng)
}

const igls = pickGeocodeOutcome(
  [{ coord: { lng: 11.41, lat: 47.23 }, featureType: "locality", text: "Igls" }],
  innsbruck,
)
assert.equal(igls.precision, "approximate")
if (igls.precision === "approximate") {
  assert.equal(igls.anchorLabel, "Igls")
  assert.equal(igls.coord.lat, 47.23)
}

const amras = pickGeocodeOutcome(
  [{ coord: { lng: 11.43, lat: 47.255 }, featureType: "locality", text: "Amras" }],
  innsbruck,
)
assert.equal(amras.precision, "approximate")
if (amras.precision === "approximate") {
  assert.equal(amras.anchorLabel, "Amras")
}

// poi gana a place aunque Mapbox devuelva el place primero.
const innsbruckAsPlace = {
  coord: innsbruck.coord,
  featureType: "place",
  text: "Innsbruck",
}
const goldenesDachl = {
  coord: { lng: 11.393, lat: 47.268 },
  featureType: "poi",
  text: "Goldenes Dachl",
}
assert.equal(pickFirstValidCandidate([innsbruckAsPlace, goldenesDachl], innsbruck), goldenesDachl)
assert.equal(pickGeocodeOutcome([innsbruckAsPlace, goldenesDachl], innsbruck).precision, "exact")

// address cuyo nombre coincide con la query sigue siendo exacto.
const alfacarNamed = { ...alfacar, text: "Alfacar", placeName: "Alfacar, Granada" }
assert.equal(pickGeocodeOutcome([alfacarNamed], granada, "Alfacar").precision, "exact")
assert.equal(candidateNameMatchesQuery(alfacarNamed, "Alfacar"), true)

// Caso Málaga: ancla locality «Centro» + address «Calle Cuenca» no es el Gallo.
const malagaCentro: RegionAnchor = {
  coord: { lng: -4.417962, lat: 36.72497 },
  featureType: "locality",
  label: "Centro, Málaga",
}
const calleCuenca = {
  coord: { lng: -4.420937, lat: 36.750699 },
  featureType: "address",
  text: "Calle Cuenca",
  placeName: "Calle Cuenca, 29014 Málaga, provincia de Málaga, España",
}
const galloMalaga = pickGeocodeOutcome(
  [calleCuenca],
  malagaCentro,
  "El Gallo Gastrobar",
)
assert.equal(galloMalaga.precision, "approximate")
if (galloMalaga.precision === "approximate") {
  assert.equal(galloMalaga.coord.lng, malagaCentro.coord.lng)
  assert.equal(galloMalaga.anchorLabel, "Centro, Málaga")
}
assert.equal(candidateNameMatchesQuery(calleCuenca, "El Gallo Gastrobar"), false)
assert.equal(
  candidateNameMatchesQuery(
    { coord: { lng: 0, lat: 0 }, featureType: "address", text: "Calle Casas Colgadas" },
    "Casas Colgadas",
  ),
  true,
)

// Ancla: «Cuenca, Zona Centro» no comparte token significativo con «Centro, Málaga».
assert.equal(sharesSignificantToken("Cuenca, Zona Centro", "Centro, Málaga"), false)
assert.equal(sharesSignificantToken("Cuenca", "Cuenca, provincia de Cuenca"), true)
assert.equal(isWeakRegionHint("Zona Centro"), true)
assert.equal(isWeakRegionHint("Casco Antiguo"), true)
assert.equal(isWeakRegionHint("Cuenca, Zona Centro"), false)
assert.deepEqual(regionAnchorQueryLadder("Cuenca, Zona Centro"), [
  "Cuenca, Zona Centro",
  "Cuenca",
])
assert.deepEqual(regionAnchorQueryLadder("Zona Centro"), [])
assert.deepEqual(regionAnchorQueryLadder("Cuenca"), ["Cuenca"])

const stacked = offsetStackedApproximate([
  { id: "a", coord: { lng: 11.404, lat: 47.27 }, precision: "approximate" },
  { id: "b", coord: { lng: 11.404, lat: 47.27 }, precision: "approximate" },
  { id: "c", coord: { lng: 0, lat: 0 }, precision: "exact" },
])
assert.equal(stacked.size, 2)
assert.ok(stacked.get("a"))
assert.ok(stacked.get("b"))
assert.equal(stacked.has("c"), false)
const da = stacked.get("a")!
const db = stacked.get("b")!
assert.ok(da.lng !== 11.404 || da.lat !== 47.27)
assert.ok(db.lng !== 11.404 || db.lat !== 47.27)
assert.notEqual(`${da.lng},${da.lat}`, `${db.lng},${db.lat}`)
const center = { lng: 11.404, lat: 47.27 }
const distA = haversineMeters(center, da)
assert.ok(distA > 50 && distA < 70, `n=2 radio ~60 m, got ${distA}`)

const five = offsetStackedApproximate(
  Array.from({ length: 5 }, (_, i) => ({
    id: `p${i}`,
    coord: center,
    precision: "approximate" as const,
  })),
)
assert.equal(five.size, 5)
const distFive = haversineMeters(center, five.get("p0")!)
assert.ok(distFive > 140 && distFive < 160, `n=5 radio ~150 m, got ${distFive}`)

const singles = offsetStackedApproximate([
  { id: "solo", coord: { lng: 1, lat: 2 }, precision: "approximate" },
])
assert.equal(singles.size, 0)

const austria: RegionAnchor = {
  coord: { lng: 14.55, lat: 47.52 },
  featureType: "country",
  label: "Austria",
}
const pasterze = { lng: 12.7128768, lat: 47.0893217 }
const bali = { lng: 115.1889, lat: -8.4095 }
assert.equal(mapsPinPassesAnchor(pasterze, austria), true)
assert.equal(mapsPinPassesAnchor(bali, austria), false)
assert.equal(candidatePassesAnchor({ coord: pasterze, featureType: "poi" }, austria), true)
assert.equal(mapsPinPassesAnchor(pasterze, granada), false)

const alaska: RegionAnchor = {
  coord: { lng: -152.4, lat: 64.2 },
  featureType: "region",
  label: "Alaska",
}
const sewardExit = { lng: -149.631, lat: 60.172 }
const fairbanks = { lng: -147.716, lat: 64.838 }
assert.equal(mapsPinPassesAnchor(sewardExit, alaska), true)
assert.equal(mapsPinPassesAnchor(fairbanks, alaska), true)
assert.equal(mapsPinPassesAnchor(bali, alaska), false)
assert.equal(candidatePassesAnchor({ coord: sewardExit, featureType: "poi" }, alaska), false)

function hit(
  partial: Pick<GeocodeCandidate, "featureType" | "text"> &
    Partial<GeocodeCandidate> & { lng: number; lat: number },
): GeocodeCandidate {
  return {
    coord: { lng: partial.lng, lat: partial.lat },
    featureType: partial.featureType,
    text: partial.text,
    placeName: partial.placeName,
    countryCode: partial.countryCode,
  }
}

const costaOurense = hit({
  lng: -8.093232,
  lat: 42.137726,
  featureType: "locality",
  text: "Costa",
  placeName: "Costa, Quintela de Leirado, provincia de Orense",
})
assert.equal(anchorHitAcceptable("Costa Vasca", costaOurense), false)
assert.equal(anchorHitAcceptable("Costa da Morte", costaOurense), false)

assert.equal(
  anchorHitAcceptable(
    "Camino de Santiago",
    hit({
      lng: -3.8,
      lat: 43.45,
      featureType: "locality",
      text: "Santiago",
      placeName: "Santiago, Cantabria, España",
    }),
  ),
  false,
)
assert.equal(
  anchorHitAcceptable(
    "Ribeira Sacra",
    hit({
      lng: -8.98,
      lat: 42.54,
      featureType: "place",
      text: "Ribeira",
      placeName: "Ribeira, A Coruña, España",
    }),
  ),
  false,
)
assert.equal(
  anchorHitAcceptable(
    "Rías Baixas",
    hit({ lng: -8.7, lat: 42.2, featureType: "locality", text: "Riás", placeName: "Riás, España" }),
  ),
  false,
)

assert.equal(
  anchorHitAcceptable(
    "Costa Brava",
    hit({
      lng: 3.13,
      lat: 41.86,
      featureType: "place",
      text: "Costa Brava",
      placeName: "Costa Brava, Cataluña, España",
    }),
  ),
  true,
)
assert.equal(
  anchorHitAcceptable(
    "Picos de Europa",
    hit({
      lng: -4.85,
      lat: 43.2,
      featureType: "region",
      text: "Picos de Europa",
      placeName: "Picos de Europa, España",
    }),
  ),
  true,
)
assert.equal(
  anchorHitAcceptable(
    "Alpujarra de Granada",
    hit({
      lng: -3.6,
      lat: 37.18,
      featureType: "region",
      text: "provincia de Granada",
      placeName: "provincia de Granada, España",
    }),
  ),
  true,
)
assert.equal(
  anchorHitAcceptable(
    "País Vasco",
    hit({
      lng: -2.62,
      lat: 43.04,
      featureType: "region",
      text: "País Vasco",
      placeName: "País Vasco, España",
    }),
  ),
  true,
)
assert.equal(
  anchorHitAcceptable(
    "Cuenca",
    hit({
      lng: -2.13,
      lat: 40.07,
      featureType: "place",
      text: "Cuenca",
      placeName: "Cuenca, España",
    }),
  ),
  true,
)
assert.equal(
  anchorHitAcceptable(
    "Innsbruck",
    hit({
      lng: 11.404,
      lat: 47.27,
      featureType: "place",
      text: "Innsbruck",
      placeName: "Innsbruck, Tirol, Austria",
    }),
  ),
  true,
)

const costaAnchor: RegionAnchor = {
  coord: costaOurense.coord,
  featureType: "locality",
  label: "Costa",
}
const gernikaLumo = hit({
  lng: -2.6759,
  lat: 43.3145,
  featureType: "place",
  text: "Gernika",
  placeName: "Gernika-Lumo, Bizkaia, España",
})
const gernikaCC = hit({
  lng: 2.173,
  lat: 41.385,
  featureType: "poi",
  text: "Gernika CC",
  placeName: "Carrer de Gernika, Barcelona, España",
})
const gernikaOut = pickGeocodeOutcome([gernikaCC, gernikaLumo], costaAnchor, "Gernika")
assert.equal(gernikaOut.precision, "approximate")
if (gernikaOut.precision === "approximate") {
  assert.equal(gernikaOut.coord.lat, gernikaLumo.coord.lat)
  assert.equal(gernikaOut.coord.lng, gernikaLumo.coord.lng)
  assert.equal(gernikaOut.anchorLabel, "Gernika")
}

const gernikaPoi = hit({
  lng: -2.6759,
  lat: 43.3145,
  featureType: "poi",
  text: "Gernika",
  placeName: "Gernika-Lumo, Bizkaia, España",
})
const gernikaCountry = pickGeocodeOutcome([gernikaPoi], spain, "Gernika")
assert.equal(gernikaCountry.precision, "exact")
if (gernikaCountry.precision === "exact") {
  assert.equal(gernikaCountry.coord.lng, gernikaPoi.coord.lng)
}

{
  const grenadaCountry = hit({
    lng: -61.679,
    lat: 12.116,
    featureType: "country",
    text: "Granada",
    placeName: "Granada",
  })
  const granadaSpain = hit({
    lng: -3.598,
    lat: 37.177,
    featureType: "place",
    text: "Granada",
    placeName: "Granada, España",
  })
  const picked = pickBestAnchorHit([grenadaCountry, granadaSpain], "Granada")
  assert.equal(picked, granadaSpain)
  const onlyIsland = pickBestAnchorHit([grenadaCountry], "Granada")
  assert.equal(onlyIsland, grenadaCountry)

  // Con los ISO puestos sigue ganando la ciudad: son países distintos (ES ≠ GD).
  const grenadaIso = hit({ ...grenadaCountry.coord, ...grenadaCountry, countryCode: "GD" })
  const granadaIso = hit({ ...granadaSpain.coord, ...granadaSpain, countryCode: "ES" })
  assert.equal(pickBestAnchorHit([grenadaIso, granadaIso], "Granada"), granadaIso)
}

{
  // Viaje real a Guatemala: la extracción etiqueta bien («Isla de Flores,
  // Guatemala»), pero Mapbox rellenaba con la subdivisión genérica del país y
  // esta pasaba por no ser de tipo estrecho. El ancla acababa a 400 km.
  const deptGuatemala = hit({
    lng: -90.5069,
    lat: 14.6349,
    featureType: "region",
    text: "Departamento de Guatemala",
    placeName: "Departamento de Guatemala, Guatemala",
    countryCode: "GT",
  })
  assert.equal(
    anchorHitAcceptable("Isla de Flores, Guatemala", deptGuatemala),
    false,
    "el sufijo del país no convierte al departamento equivocado en la zona pedida",
  )
  assert.equal(anchorHitAcceptable("Río Dulce, Guatemala", deptGuatemala), false)
  assert.equal(anchorHitAcceptable("Volcán Acatenango, Guatemala", deptGuatemala), false)
  // Rechazarlo deja que la escalera pruebe los peldaños siguientes.
  assert.deepEqual(regionAnchorQueryLadder("Isla de Flores, Guatemala"), [
    "Isla de Flores, Guatemala",
    "Isla de Flores",
    "isla flores guatemala",
  ])
  // «Río Dulce» sí ancla: el hit cubre el único token significativo («rio» son
  // 3 letras), así que pasa incluso siendo de tipo estrecho.
  const rioDulce = hit({
    lng: -88.9497,
    lat: 15.6613,
    featureType: "place",
    text: "Río Dulce",
    placeName: "Río Dulce, Izabal, Guatemala",
    countryCode: "GT",
  })
  assert.equal(anchorHitAcceptable("Río Dulce", rioDulce), true)
  assert.equal(pickBestAnchorHit([deptGuatemala, rioDulce], "Río Dulce"), rioDulce)

  // «Isla de Flores» contra el pueblo «Flores» no pasa el guardia de tipos
  // estrechos (le falta «isla»), igual que «Costa Vasca» contra la aldea
  // «Costa». Quedarse sin ancla es el resultado seguro: se cae al ancla del
  // viaje, que al ser país no descarta ningún candidato. Anclar a 400 km sí
  // descartaba los buenos.
  const flores = hit({
    lng: -89.8919,
    lat: 16.9316,
    featureType: "place",
    text: "Flores",
    placeName: "Flores, Petén, Guatemala",
    countryCode: "GT",
  })
  assert.equal(anchorHitAcceptable("Isla de Flores", flores), false)
  assert.equal(pickBestAnchorHit([deptGuatemala, flores], "Isla de Flores"), null)

  // Y el hint que sí es de la capital sigue anclando ahí.
  assert.equal(anchorHitAcceptable("Ciudad de Guatemala", deptGuatemala), true)

  // El último peldaño de la escalera pierde las comas: sin pasarle el hint
  // original, «guatemala» vuelve a ser parte del ámbito y el departamento cuela.
  assert.equal(anchorHitAcceptable("isla flores guatemala", deptGuatemala), true)
  assert.equal(
    anchorHitAcceptable("isla flores guatemala", deptGuatemala, "Isla de Flores"),
    false,
  )
  assert.equal(
    pickBestAnchorHit([deptGuatemala], "isla flores guatemala", {
      hint: "Isla de Flores, Guatemala",
    }),
    null,
  )
  assert.equal(
    pickBestAnchorHit([deptGuatemala], "dulce guatemala", { hint: "Río Dulce, Guatemala" }),
    null,
  )

  assert.equal(anchorQueryCore("Isla de Flores, Guatemala"), "Isla de Flores")
  assert.equal(
    anchorQueryCore("Zona Centro, Madrid"),
    "Zona Centro, Madrid",
    "si el núcleo es débil vale la consulta entera",
  )
}

{
  // La subdivisión intermedia del hint sí distingue zonas, y para un sitio que
  // Mapbox no conoce por nombre (Tikal, Yaxhá) es la mejor ancla que hay: 150 km
  // desde Petén cubren el yacimiento; el país deja la proximidad en el centroide.
  const guatemala = hit({
    lng: -90.2308,
    lat: 15.7835,
    featureType: "country",
    text: "Guatemala",
    placeName: "Guatemala",
    countryCode: "GT",
  })
  const deptPeten = hit({
    lng: -89.8,
    lat: 16.9,
    featureType: "region",
    text: "Departamento de Petén",
    placeName: "Departamento de Petén, Guatemala",
    countryCode: "GT",
  })
  const deptGuatemala = hit({
    lng: -90.5069,
    lat: 14.6349,
    featureType: "region",
    text: "Departamento de Guatemala",
    placeName: "Departamento de Guatemala, Guatemala",
    countryCode: "GT",
  })

  assert.equal(anchorQueryScope("Tikal, Petén, Guatemala", "Guatemala"), "Tikal, Petén")
  assert.equal(
    pickBestAnchorHit([deptPeten, guatemala, deptGuatemala], "Tikal, Petén, Guatemala"),
    deptPeten,
    "la zona que declara el artículo gana al departamento homónimo del país",
  )

  // Sin subdivisión en el hint no hay nada que rescatar: el departamento de la
  // capital no puede anclar un sitio del otro extremo del país.
  assert.equal(anchorQueryScope("Isla de Flores, Guatemala", "Guatemala"), "Isla de Flores")
  assert.equal(pickBestAnchorHit([deptGuatemala, guatemala], "Isla de Flores, Guatemala"), null)

  // El sufijo solo se descuenta si de verdad es el país.
  assert.equal(anchorQueryScope("Santiago, Chile", "Guatemala"), "Santiago, Chile")
  assert.equal(anchorQueryScope("Guatemala", "Guatemala"), "Guatemala")
}

{
  // Un país con subdivisión homónima: el ancla tiene que ser el país. Con la
  // región, el radio baja a 150 km y Petén (~400 km) se queda fuera del viaje.
  const guatemalaCountry = hit({
    lng: -90.2308,
    lat: 15.7835,
    featureType: "country",
    text: "Guatemala",
    placeName: "Guatemala",
    countryCode: "GT",
  })
  const guatemalaRegion = hit({
    lng: -90.5069,
    lat: 14.6349,
    featureType: "region",
    text: "Departamento de Guatemala",
    placeName: "Departamento de Guatemala, Guatemala",
    countryCode: "GT",
  })
  const guatemalaCity = hit({
    lng: -90.5133,
    lat: 14.6407,
    featureType: "place",
    text: "Ciudad de Guatemala",
    placeName: "Ciudad de Guatemala, Departamento de Guatemala, Guatemala",
    countryCode: "GT",
  })
  assert.equal(
    pickBestAnchorHit([guatemalaCountry, guatemalaRegion, guatemalaCity], "Guatemala"),
    guatemalaCountry,
  )

  // Sin ISO (caché vieja o v5 sin context) se mantiene el criterio de siempre.
  const noIso = hit({
    lng: -90.5069,
    lat: 14.6349,
    featureType: "region",
    text: "Departamento de Guatemala",
    placeName: "Departamento de Guatemala, Guatemala",
  })
  assert.equal(pickBestAnchorHit([guatemalaCountry, noIso], "Guatemala"), noIso)
}

{
  // «Ciudad de México» no es «México»: el ancla debe seguir siendo la capital, o
  // la proximidad se iría al centroide del país. `ciudad` es token débil, así que
  // comparar por tokens daría un falso positivo; por eso se compara el nombre.
  const mexicoCountry = hit({
    lng: -102.5528,
    lat: 23.6345,
    featureType: "country",
    text: "México",
    placeName: "México",
    countryCode: "MX",
  })
  const mexicoCity = hit({
    lng: -99.1332,
    lat: 19.4326,
    featureType: "place",
    text: "Ciudad de México",
    placeName: "Ciudad de México, México",
    countryCode: "MX",
  })
  assert.equal(pickBestAnchorHit([mexicoCountry, mexicoCity], "Ciudad de México"), mexicoCity)
  // Pero si el destino es el país a secas, sí manda el país.
  assert.equal(pickBestAnchorHit([mexicoCountry, mexicoCity], "México"), mexicoCountry)
}

{
  // Criterio del ancla por POI (`poiAnchorFallback` en mapbox.ts): el candidato
  // tiene que cubrir el **núcleo** del hint. Ni el hint entero ni un token.
  const reservaLago = hit({
    lng: -91.2,
    lat: 14.69,
    featureType: "poi",
    text: "Reserva de Usos Múltiples de la Cuenca del Lago Atitlán",
    placeName: "Reserva de Usos Múltiples de la Cuenca del Lago Atitlán, Sololá, Guatemala",
    countryCode: "GT",
  })
  const parqueSantiago = hit({
    lng: -91.2295,
    lat: 14.6383,
    featureType: "poi",
    text: "Parque Central de Santiago Atitlán",
    placeName: "Parque Central de Santiago Atitlán, Santiago Atitlán, Guatemala",
    countryCode: "GT",
  })
  const core = anchorQueryCore("Santiago de Atitlán, Lago Atitlán, Guatemala")
  assert.equal(core, "Santiago de Atitlán")
  assert.equal(
    candidateNameMatchesQuery(reservaLago, core),
    false,
    "compartir «atitlan» no basta: la reserva está en la otra orilla",
  )
  assert.equal(candidateNameMatchesQuery(parqueSantiago, core), true)

  // Contra el hint completo tampoco vale: el POI no repite el contexto y se
  // perdería un ancla buena.
  const sanJuan = hit({
    lng: -91.2894,
    lat: 14.6969,
    featureType: "poi",
    text: "San Juan La Laguna",
    placeName: "San Juan La Laguna, Sololá, Guatemala",
    countryCode: "GT",
  })
  assert.equal(
    candidateNameMatchesQuery(sanJuan, "San Juan de la Laguna, Lago Atitlán, Guatemala"),
    false,
  )
  assert.equal(
    candidateNameMatchesQuery(sanJuan, anchorQueryCore("San Juan de la Laguna, Lago Atitlán, Guatemala")),
    true,
  )

  // Un negocio con el nombre del sitio sirve de ancla: está en el sitio.
  const hotelFlores = hit({
    lng: -89.8919,
    lat: 16.9316,
    featureType: "poi",
    text: "Hotel Isla de Flores",
    placeName: "Hotel Isla de Flores, Flores, Petén, Guatemala",
    countryCode: "GT",
  })
  assert.equal(candidateNameMatchesQuery(hotelFlores, anchorQueryCore("Isla de Flores, Guatemala")), true)
}

console.log("geocode-validate: ok")
