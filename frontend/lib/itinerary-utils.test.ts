import assert from "node:assert/strict"
import type { Itinerary, Source, SourceBasicItem, SourceItem, Trip } from "@/types/itinerary"
import { itemTypeIcon, itemTypeLabel } from "./item-styles"
import {
  attachExperienceLinksFromHtml,
  dedupeRedundantPlaces,
  dropDuplicateOtherBasics,
  flattenItinerary,
  hydrateAffiliateUrlsFromSources,
  liftOtherBasicsToActivities,
  normalizeAffiliateUrl,
} from "./itinerary-utils"

function itinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    destination: "Alaska, EE. UU.",
    total_days: 1,
    source_structured_by_days: true,
    days: [
      {
        day: 1,
        title: "Anchorage",
        accommodations: [],
        activities: [],
        restaurants: [],
        transport: [],
        tips: null,
      },
    ],
    general_tips: null,
    basics: [],
    ...overrides,
  }
}

{
  const items = flattenItinerary(
    itinerary({
      days: [
        {
          day: 1,
          title: "Anchorage",
          accommodations: [],
          restaurants: [],
          transport: [],
          tips: null,
          activities: [
            {
              name: "Avistamiento de osos grizzly",
              type: "excursion",
              notes: "Hidroavión",
              affiliate_url: "https://www.getyourguide.com/alaska-osos?aid=1",
              sub_activities: [
                {
                  name: "Crucero glaciar Columbia",
                  type: "excursion",
                  notes: null,
                  affiliate_url: "https://operator.example/columbia/",
                },
              ],
            },
            {
              name: "Parque Nacional Denali",
              type: "attraction",
              notes: null,
              affiliate_url: null,
            },
          ],
        },
      ],
    }),
  )
  const tour = items.find((i) => i.name === "Avistamiento de osos grizzly")
  assert.ok(tour)
  assert.equal(tour!.type, "activity")
  assert.equal(tour!.affiliateUrl, "https://www.getyourguide.com/alaska-osos?aid=1")
  assert.equal(tour!.vendor, "Getyourguide")

  const sub = items.find((i) => i.name === "Crucero glaciar Columbia")
  assert.ok(sub)
  assert.equal(sub!.affiliateUrl, "https://operator.example/columbia/")
  assert.equal(sub!.vendor, "Operator")

  const place = items.find((i) => i.name === "Parque Nacional Denali")
  assert.ok(place)
  assert.equal(place!.affiliateUrl, null)
  assert.equal(place!.vendor, null)
}

{
  assert.equal(
    normalizeAffiliateUrl("https://WWW.Example.COM/columbia/?ref=blog"),
    "https://www.example.com/columbia?ref=blog",
  )
  assert.equal(normalizeAffiliateUrl("  https://example.com/x/  "), "https://example.com/x")
  assert.equal(normalizeAffiliateUrl(null), null)
  assert.equal(normalizeAffiliateUrl("   "), null)
}

{
  const items: Pick<SourceItem, "affiliateUrl">[] = [
    { affiliateUrl: "https://aff.example/osos/" },
  ]
  const basics: SourceBasicItem[] = [
    {
      id: "b-tour",
      category: "other",
      name: "5% osos",
      detail: null,
      vendor: "GetYourGuide",
      affiliateUrl: "https://AFF.example/osos?aid=1",
      thumbUrl: null,
    },
    {
      id: "b-ins",
      category: "insurance",
      name: "Heymondo",
      detail: null,
      vendor: "Heymondo",
      affiliateUrl: "https://aff.example/osos/",
      thumbUrl: null,
    },
    {
      id: "b-orphan",
      category: "other",
      name: "Otro tour",
      detail: null,
      vendor: null,
      affiliateUrl: "https://aff.example/columbia",
      thumbUrl: null,
    },
  ]
  // Querystring distinta → no casan; el basic `other` de osos sobrevive (mismo path, distinto search).
  const keptQuery = dropDuplicateOtherBasics(items, basics)
  assert.equal(
    keptQuery.some((b) => b.id === "b-tour"),
    true,
    "querystring distinta no es el mismo afiliado",
  )

  const sameUrlBasics: SourceBasicItem[] = [
    {
      id: "b-dup",
      category: "other",
      name: "Osos (descuento)",
      detail: null,
      vendor: null,
      affiliateUrl: "https://AFF.example/osos/",
      thumbUrl: null,
    },
    {
      id: "b-ins",
      category: "insurance",
      name: "Heymondo",
      detail: null,
      vendor: "Heymondo",
      affiliateUrl: "https://aff.example/osos/",
      thumbUrl: null,
    },
    {
      id: "b-orphan",
      category: "other",
      name: "Otro tour",
      detail: null,
      vendor: null,
      affiliateUrl: "https://aff.example/columbia",
      thumbUrl: null,
    },
  ]
  const kept = dropDuplicateOtherBasics(items, sameUrlBasics)
  assert.deepEqual(
    kept.map((b) => b.id),
    ["b-ins", "b-orphan"],
  )
}

{
  const items: SourceItem[] = [
    {
      id: "si-osos",
      type: "activity",
      name: "Avistamiento de osos grizzly en Katmai",
      detail: null,
      dayHint: 4,
      affiliateUrl: null,
    },
    {
      id: "si-columbia",
      type: "activity",
      name: "Crucero por Glaciar Columbia en Prince William Sound",
      detail: null,
      dayHint: 9,
      affiliateUrl: null,
    },
    {
      id: "si-denali",
      type: "activity",
      name: "Parque Nacional Denali",
      detail: null,
      dayHint: 15,
      affiliateUrl: null,
    },
  ]
  const basics: SourceBasicItem[] = [
    {
      id: "sb-hey",
      category: "insurance",
      name: "Heymondo",
      detail: null,
      vendor: "Heymondo",
      affiliateUrl: "https://heymondo.es/x",
      thumbUrl: null,
    },
    {
      id: "sb-osos",
      category: "other",
      name: "Excursión Avistamiento de osos grizzly en Katmai",
      detail: "Hidroavión",
      vendor: "Civitatis",
      affiliateUrl: "https://www.civitatis.com/es/homer/osos",
      thumbUrl: null,
    },
    {
      id: "sb-col",
      category: "other",
      name: "Crucero Glaciar Columbia",
      detail: "6 h",
      vendor: "GetYourGuide",
      affiliateUrl: "https://www.getyourguide.es/columbia",
      thumbUrl: null,
    },
  ]
  const lifted = liftOtherBasicsToActivities(items, basics)
  assert.deepEqual(
    lifted.basics.map((b) => b.id),
    ["sb-hey"],
  )
  const osos = lifted.items.find((i) => i.id === "si-osos")
  assert.equal(osos?.affiliateUrl, "https://www.civitatis.com/es/homer/osos")
  assert.equal(itemTypeLabel("activity", osos), "Actividad")
  const columbia = lifted.items.find((i) => i.id === "si-columbia")
  assert.equal(columbia?.affiliateUrl, "https://www.getyourguide.es/columbia")
  assert.equal(itemTypeLabel("activity", columbia), "Actividad")
  const denali = lifted.items.find((i) => i.id === "si-denali")
  assert.equal(denali?.affiliateUrl, null)
  assert.equal(itemTypeLabel("activity", denali), "Lugar")
}

{
  const lifted = liftOtherBasicsToActivities(
    [],
    [
      {
        id: "sb-free",
        category: "other",
        name: "Free tour centro",
        detail: null,
        vendor: null,
        affiliateUrl: "https://www.guruwalk.com/madrid",
        thumbUrl: null,
      },
    ],
  )
  assert.equal(lifted.basics.length, 0)
  assert.equal(lifted.items.length, 1)
  assert.equal(lifted.items[0]?.id, "si-from-sb-free")
  assert.equal(lifted.items[0]?.type, "activity")
  assert.equal(itemTypeLabel("activity", lifted.items[0]), "Actividad")
}

{
  const omioBasic: SourceBasicItem = {
    id: "sb-omio",
    category: "other",
    name: "Omio - Búsqueda y reserva de transporte",
    detail: "Alternativa para consultar horarios",
    vendor: "Omio",
    affiliateUrl: "https://www.omio.com/es",
    thumbUrl: null,
  }
  const kept = liftOtherBasicsToActivities([], [omioBasic])
  assert.equal(kept.items.length, 0)
  assert.equal(kept.basics.length, 1)
  assert.equal(kept.basics[0]?.id, "sb-omio")
}

{
  const demoted = liftOtherBasicsToActivities(
    [
      {
        id: "si-from-sb-omio",
        type: "activity",
        name: "Omio - Búsqueda y reserva de transporte",
        detail: "horarios",
        dayHint: null,
        affiliateUrl: "https://www.omio.es/r",
        vendor: "Omio",
      },
    ],
    [],
  )
  assert.equal(demoted.items.length, 0)
  assert.equal(demoted.basics.length, 1)
  assert.equal(demoted.basics[0]?.id, "sb-omio")
  assert.equal(demoted.basics[0]?.category, "other")
}

assert.equal(itemTypeLabel("activity"), "Lugar")
assert.equal(itemTypeLabel("activity", { affiliateUrl: null }), "Lugar")
assert.equal(itemTypeLabel("activity", { affiliateUrl: "  " }), "Lugar")
assert.equal(
  itemTypeLabel("activity", { affiliateUrl: "https://aff.example/osos" }),
  "Actividad",
)
assert.equal(itemTypeLabel("stay"), "Alojamiento")
assert.equal(itemTypeLabel("stay", { affiliateUrl: null }), "Alojamiento")
assert.equal(itemTypeLabel("food"), "Restaurante")
assert.equal(itemTypeLabel("transport"), "Transporte")

{
  const placeIcon = itemTypeIcon("activity")
  const activityIcon = itemTypeIcon("activity", { affiliateUrl: "https://aff.example/t" })
  assert.notEqual(placeIcon, activityIcon)
  assert.equal(placeIcon, itemTypeIcon("activity", { affiliateUrl: null }))
  assert.equal(itemTypeIcon("stay", { affiliateUrl: "https://booking.example" }), itemTypeIcon("stay"))
}

{
  const glacier: SourceItem = {
    id: "si-trek",
    type: "activity",
    name: "Trekking al Exit Glacier",
    detail: "Senderismo accesible al glaciar Exit.",
    dayHint: 5,
    affiliateUrl: null,
  }
  const place: SourceItem = {
    id: "si-exit",
    type: "activity",
    name: "Exit Glacier",
    detail: "Glaciar accesible mediante senderismo desde Seward.",
    dayHint: 5,
    affiliateUrl: null,
  }
  const trail: SourceItem = {
    id: "si-tonsina",
    type: "activity",
    name: "Sendero costero Tonsina",
    detail: "Ruta de senderismo por la costa cerca de Seward.",
    dayHint: 5,
    affiliateUrl: null,
  }
  const collapsed = dedupeRedundantPlaces([glacier, place, trail])
  assert.equal(collapsed.length, 2)
  assert.equal(collapsed[0]?.name, "Exit Glacier")
  assert.equal(
    collapsed[0]?.detail,
    "Glaciar accesible mediante senderismo desde Seward.",
  )
  assert.equal(collapsed[1]?.id, "si-tonsina")
}

{
  const cruise: SourceItem = {
    id: "si-cruise",
    type: "activity",
    name: "Crucero por Glaciar Columbia",
    detail: "6 h",
    dayHint: 3,
    affiliateUrl: "https://www.getyourguide.es/columbia",
  }
  const columbia: SourceItem = {
    id: "si-columbia-poi",
    type: "activity",
    name: "Glaciar Columbia",
    detail: null,
    dayHint: 3,
    affiliateUrl: null,
  }
  const kept = dedupeRedundantPlaces([cruise, columbia])
  assert.equal(kept.length, 2)
  assert.deepEqual(
    kept.map((i) => i.id),
    ["si-cruise", "si-columbia-poi"],
  )

  const cruiseAsPlace: SourceItem = { ...cruise, id: "si-cruise-place", affiliateUrl: null }
  const stillTwo = dedupeRedundantPlaces([cruiseAsPlace, columbia])
  assert.equal(stillTwo.length, 2)
}

{
  const day5: SourceItem = {
    id: "si-d5",
    type: "activity",
    name: "Exit Glacier",
    detail: null,
    dayHint: 5,
    affiliateUrl: null,
  }
  const day6: SourceItem = {
    id: "si-d6",
    type: "activity",
    name: "Trekking al Exit Glacier",
    detail: null,
    dayHint: 6,
    affiliateUrl: null,
  }
  const split = dedupeRedundantPlaces([day5, day6])
  assert.equal(split.length, 2)
}

{
  const trip = {
    id: "t1",
    days: [
      {
        id: "d1",
        label: "",
        items: [
          {
            id: "ud-1",
            sourceItemId: "si-osos",
            sourceId: "src-1",
            type: "activity",
            name: "Avistamiento de osos grizzly en Katmai",
            detail: null,
            sourceAuthor: "blog",
            affiliateUrl: null,
          },
        ],
      },
    ],
  } as unknown as Trip
  const source = {
    id: "src-1",
    items: [
      {
        id: "si-osos",
        type: "activity",
        name: "Avistamiento de osos grizzly en Katmai",
        detail: null,
        dayHint: 4,
        affiliateUrl: "https://www.civitatis.com/osos",
      },
    ],
    basics: [],
  } as unknown as Source
  const [hydrated] = hydrateAffiliateUrlsFromSources([trip], [source])
  assert.equal(
    hydrated!.days[0]!.items[0]!.affiliateUrl,
    "https://www.civitatis.com/osos",
  )
}

{
  const html = `
    <p>Empieza con un <a href="https://www.civitatis.com/es/granada/free-tour-granada/?aid=1006">free tour por Granada</a>.</p>
    <p>Reserva una <a href="https://www.civitatis.com/es/granada/tour-alhambra-palacios-nazaries/?aid=1006"><strong>visita guiada por la Alhambra y los palacios nazaríes</strong></a>.</p>
    <p>Ideal el atardecer en San Nicolás.</p>
    <p>El <a href="https://www.civitatis.com/es/granada/hammam-al-andalus-granada/?aid=1006">Hammam al-Andalus</a>.</p>
  `
  const alhambra: SourceItem = {
    id: "si-alh",
    type: "activity",
    name: "Visita guiada por la Alhambra y palacios nazaríes",
    detail: "Para completar el viaje además de ir de tapas.",
    dayHint: 1,
    affiliateUrl: null,
  }
  const sunset: SourceItem = {
    id: "si-nico",
    type: "activity",
    name: "Atardecer en San Nicolás",
    detail: "Ubicado en el Albaycín, ideal antes o después de tapear.",
    dayHint: 1,
    affiliateUrl: null,
  }
  const stamped = attachExperienceLinksFromHtml(html, [alhambra, sunset])
  assert.equal(
    stamped.find((i) => i.id === "si-alh")?.affiliateUrl,
    "https://www.civitatis.com/es/granada/tour-alhambra-palacios-nazaries/?aid=1006",
  )
  assert.equal(itemTypeLabel("activity", stamped.find((i) => i.id === "si-alh")), "Actividad")
  assert.equal(stamped.find((i) => i.id === "si-nico")?.affiliateUrl, null)
  assert.equal(itemTypeLabel("activity", stamped.find((i) => i.id === "si-nico")), "Lugar")
  const freeTour = stamped.find((i) => /free tour/i.test(i.name))
  assert.ok(freeTour)
  assert.equal(
    freeTour?.affiliateUrl,
    "https://www.civitatis.com/es/granada/free-tour-granada/?aid=1006",
  )
  assert.equal(itemTypeLabel("activity", freeTour), "Actividad")
}

console.log("itinerary-utils flatten/dedupe/label: ok")
