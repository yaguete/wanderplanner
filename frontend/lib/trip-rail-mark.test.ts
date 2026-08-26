import assert from "node:assert/strict"
import { tripRailGlyph } from "./trip-rail-mark"

{
  assert.equal(tripRailGlyph({ name: "Alaska" }), "🏔️")
  assert.equal(tripRailGlyph({ name: "Granada — 1 días" }), "🕌")
  assert.equal(tripRailGlyph({ name: "Escocia en Navidades" }), "🏰")
}

{
  assert.equal(tripRailGlyph({ name: "Vacaciones", area: "Alaska, USA" }), "🏔️")
  assert.equal(tripRailGlyph({ name: "Guía de la Alhambra" }), "🕌")
}

{
  assert.equal(tripRailGlyph({ name: "Navidad en casa" }), "🎄")
  assert.notEqual(tripRailGlyph({ name: "Escocia en Navidades" }), "🎄")
}

{
  assert.equal(tripRailGlyph({ name: "Roadtrip", countries: ["JP"] }), "🌸")
  assert.equal(tripRailGlyph({ name: "Granada", countries: ["ES"] }), "🕌")
}

{
  const a = tripRailGlyph({ name: "Roadtrip con Marta", id: "aaa" })
  const b = tripRailGlyph({ name: "Roadtrip con Marta", id: "aaa" })
  assert.equal(a, b)
  assert.match(a, /\p{Extended_Pictographic}/u)
  assert.notEqual(a, "🏔️")
}

{
  assert.equal(
    tripRailGlyph({ name: "Sin nombre útil", countries: ["ES", "US"], id: "same" }),
    tripRailGlyph({ name: "Sin nombre útil", countries: ["ES"], id: "same" }),
  )
}
