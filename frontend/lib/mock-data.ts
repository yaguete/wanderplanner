import type { Trip, Source, SourceItem, UserDay } from "@/types/itinerary"

// ── Sources (inspiration articles) ─────────────────────────────────────────────

export const MOCK_SOURCES: Source[] = [
  {
    id: "src-1",
    url: "https://lacosmopolilla.com/que-ver-en-soportujar/",
    author: "cosmopolilla",
    title: "Qué ver en Soportújar [2026] — Guía del Pueblo de las Brujas",
    area: "Soportújar, Granada",
    articleHtml: "",
    ogImage: null,
    items: [
      { id: "si-1", type: "transport", name: "Coche Granada → Soportújar", detail: "50 min desde la capital granadina por carretera de montaña", dayHint: null, region: "Granada" },
      { id: "si-2", type: "transport", name: "Coche Órgiva → Soportújar", detail: "Tomar carretera A-4132 en dirección al barranco", dayHint: null, region: "Órgiva, Granada" },
      { id: "si-3", type: "transport", name: "Bus lanzadera al centro", detail: "Parking bajo del pueblo → centro de Soportújar", dayHint: null, region: "Soportújar, Granada" },
      {
        id: "si-4",
        type: "stay",
        name: "La Casa Rural El escondite de Hansel y Gretel",
        detail: "Se agota con meses de antelación en Halloween y Feria",
        dayHint: null,
        region: "Soportújar, Granada",
        affiliateUrl: "https://www.booking.com/hotel/es/example-casa-rural-soportujar.html?aid=MOCK",
        vendor: "Booking",
      },
      { id: "si-5", type: "stay", name: "Dreams Alpujarra", detail: "A mitad de camino a Pampaneira, alternativa si no hay dispo", dayHint: null, region: "Pampaneira, Granada" },
      { id: "si-6", type: "food", name: "Taberna Romero", detail: "Mejor lugar para comer, calle principal junto al Ayuntamiento", dayHint: null, region: "Soportújar, Granada" },
      { id: "si-7", type: "food", name: "Bar Correíllo", detail: "Calle Real, excelente opción para cañas con generosa tapa", dayHint: null, region: "Soportújar, Granada" },
      { id: "si-8", type: "activity", name: "Mirador del Embrujo", detail: "Vistas panorámicas del barranco de la Alpujarra", dayHint: null, region: "Soportújar, Granada" },
      { id: "si-9", type: "activity", name: "Ruta de las esculturas", detail: "Paseo por el pueblo siguiendo las figuras de brujas", dayHint: null, region: "Soportújar, Granada" },
    ],
    basics: [
      {
        id: "sb-1",
        category: "insurance",
        name: "Heymondo — seguro de viaje",
        detail: "Enlace de afiliado de La Cosmopolilla (mismo artículo)",
        vendor: "Heymondo",
        affiliateUrl:
          "https://heymondo.es/?utm_medium=Afiliado&utm_source=LACOSMOPOLILLA&utm_campaign=PRINCIPAL&cod_descuento=LACOSMOPOLILLA&ag_campaign=LATERAL&agencia=87f85e31d96e19a785327c2c3cca8c39a092",
      },
      {
        id: "sb-2",
        category: "sim",
        name: "Holafly eSIM",
        detail: "Datos ilimitados en varios destinos",
        vendor: "Holafly",
        affiliateUrl: "https://esim.holafly.com/?ref=MOCK",
      },
    ],
  },
  {
    id: "src-2",
    url: "https://claudiascronicas.com/3-dias-alpujarra/",
    author: "claudiascronicas",
    title: "3 días en la Alpujarra Granadina — Ruta completa",
    area: "Alpujarra granadina, Granada",
    articleHtml: "",
    ogImage: null,
    items: [
      { id: "si-10", type: "transport", name: "Ruta en coche desde Málaga", detail: "2h por la A-44, alternativa a salir desde Granada", dayHint: 1, region: "Málaga → Granada" },
      { id: "si-11", type: "stay", name: "Hotel Alcadima (Lanjarón)", detail: "Base perfecta para explorar varios pueblos", dayHint: null, region: "Lanjarón, Granada" },
      { id: "si-12", type: "activity", name: "Pampaneira — pueblo blanco", detail: "Artesanía, jarapas, y chocolate artesano", dayHint: 1, region: "Pampaneira, Granada" },
      { id: "si-13", type: "activity", name: "Bubión — centro budista", detail: "O Sel Ling, retiro budista con vistas increíbles", dayHint: 2, region: "Bubión, Granada" },
      { id: "si-14", type: "food", name: "Bodega La Alacena", detail: "Plato alpujarreño contundente, en Capileira", dayHint: 2, region: "Capileira, Granada" },
      { id: "si-15", type: "activity", name: "Trevélez — jamón", detail: "Pueblo más alto de España, secaderos de jamón", dayHint: 3, region: "Trevélez, Granada" },
    ],
    basics: [
      {
        id: "sb-3",
        category: "carRental",
        name: "Discovercars — comparador de alquiler",
        detail: "Revisa precios y descuentos del artículo",
        vendor: "Discovercars",
        affiliateUrl: "https://www.discovercars.com/?a_aid=MOCK",
      },
    ],
  },
]

// ── Trips ──────────────────────────────────────────────────────────────────────

export const MOCK_TRIPS: Trip[] = [
  {
    id: "trip-1",
    name: "Alpujarras, Granada",
    countries: ["ES"],
    startDate: "2026-09-12",
    endDate: "2026-09-17",
    numDays: 5,
    cover: "🏔️",
    coverUrl: null,
    sourceIds: ["src-1", "src-2"],
    basics: [
      {
        id: "ubi-1",
        sourceBasicItemId: "sb-1",
        sourceId: "src-1",
        category: "insurance",
        name: "Heymondo — seguro de viaje",
        detail: "Enlace de afiliado de La Cosmopolilla (mismo artículo)",
        vendor: "Heymondo",
        affiliateUrl:
          "https://heymondo.es/?utm_medium=Afiliado&utm_source=LACOSMOPOLILLA&utm_campaign=PRINCIPAL&cod_descuento=LACOSMOPOLILLA&ag_campaign=LATERAL&agencia=87f85e31d96e19a785327c2c3cca8c39a092",
        sourceAuthor: "cosmopolilla",
      },
    ],
    days: [
      {
        id: "ud-1",
        label: "Llegada a Soportújar",
        items: [
          {
            id: "udi-1",
            sourceItemId: "si-1",
            sourceId: "src-1",
            type: "transport",
            name: "Coche Granada → Soportújar",
            detail: "50 min desde la capital granadina por carretera de montaña",
            sourceAuthor: "cosmopolilla",
            region: "Granada",
          },
          {
            id: "udi-2",
            sourceItemId: "si-8",
            sourceId: "src-1",
            type: "activity",
            name: "Mirador del Embrujo",
            detail: "Vistas panorámicas del barranco de la Alpujarra",
            sourceAuthor: "cosmopolilla",
            region: "Soportújar, Granada",
          },
        ],
      },
      {
        id: "ud-2",
        label: "Soportújar y alrededores",
        items: [],
      },
      {
        id: "ud-3",
        label: "Pueblos blancos",
        items: [
          {
            id: "udi-3",
            sourceItemId: "si-12",
            sourceId: "src-2",
            type: "activity",
            name: "Pampaneira — pueblo blanco",
            detail: "Artesanía, jarapas, y chocolate artesano",
            sourceAuthor: "claudiascronicas",
            region: "Pampaneira, Granada",
          },
        ],
      },
    ],
  },
  {
    id: "trip-2",
    name: "Yogyakarta, Java",
    countries: ["ID"],
    startDate: "2026-11-03",
    endDate: "2026-11-10",
    numDays: 7,
    cover: "🌋",
    coverUrl: null,
    sourceIds: [],
    basics: [],
    days: [
      { id: "ud-4", label: "Llegada", items: [] },
    ],
  },
  {
    id: "trip-3",
    name: "Costa Amalfitana",
    countries: ["IT"],
    startDate: null,
    endDate: null,
    numDays: null,
    cover: "🌊",
    coverUrl: null,
    sourceIds: [],
    basics: [],
    days: [{ id: "ud-5", label: "", items: [] }],
  },
]
