import assert from "node:assert/strict"
import { rankPlaceSuggestions } from "./place-suggest-rank"

const guggenheim = rankPlaceSuggestions(
  [
    {
      text: "Nerua Guggenheim Bilbao",
      placeName: "Abandoibarra Etorb., Bilbao",
      poiCategoryIds: ["restaurant"],
    },
    {
      text: "Museo Guggenheim Bilbao",
      placeName: "Abandoibarra Etorbidea, Bilbao",
      poiCategoryIds: ["tourist_attraction"],
    },
    {
      text: "Centro Guggenheim Bilbao",
      placeName: "Bilbao",
      poiCategoryIds: ["services"],
    },
    {
      text: "Bar at Guggenheim Museum Bilbao",
      placeName: "Bilbao",
      poiCategoryIds: ["bar"],
    },
  ],
  "Guggenheim Bilbao",
  "activity",
)
assert.equal(guggenheim[0]!.text, "Museo Guggenheim Bilbao")
assert.ok(guggenheim.find((s) => s.text.startsWith("Nerua")))
assert.ok(guggenheim.find((s) => s.text.startsWith("Centro")))

const alhambra = rankPlaceSuggestions(
  [
    {
      text: "Locutorio Alhambra Granada",
      placeName: "Granada",
      poiCategoryIds: ["shopping"],
    },
    {
      text: "Alhambra granada",
      placeName: "Granada",
      poiCategoryIds: ["historic_site", "monument", "tourist_attraction"],
    },
    {
      text: "Apartamento familiar Alhambra Granada",
      placeName: "Granada",
      poiCategoryIds: [],
    },
    {
      text: "Alhambra",
      placeName: "Calle Real de la Alhambra, Granada",
      poiCategoryIds: ["historic_site", "monument", "tourist_attraction"],
    },
    {
      text: "Alhambra Churrería | Granada",
      placeName: "Granada",
      poiCategoryIds: ["fast_food", "food"],
    },
  ],
  "Alhambra, Granada",
  "activity",
)
assert.equal(alhambra[0]!.poiCategoryIds?.includes("tourist_attraction"), true)
assert.ok(["Alhambra", "Alhambra granada"].includes(alhambra[0]!.text))

const sagrada = rankPlaceSuggestions(
  [
    {
      text: "Sagrada Família",
      placeName: "Barcelona",
      poiCategoryIds: null,
    },
    {
      text: "Bar Sagrada",
      placeName: "Barcelona",
      poiCategoryIds: ["bar"],
    },
  ],
  "Sagrada Família",
  "activity",
)
assert.equal(sagrada.length, 2)
assert.ok(sagrada.some((s) => s.text === "Sagrada Família"))

console.log("place-suggest-rank: ok")
