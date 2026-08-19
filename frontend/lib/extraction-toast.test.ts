import assert from "node:assert/strict"
import { extractionToastLabel } from "./extraction-toast"

assert.equal(
  extractionToastLabel({
    author: "lacosmopolilla",
    totalDays: 5,
    items: [{}, {}, {}] as never,
  }),
  "Fuente añadida · @lacosmopolilla",
)

assert.equal(
  extractionToastLabel({
    author: "@lacosmopolilla",
    totalDays: null,
    items: Array.from({ length: 7 }, () => ({})),
  } as never),
  "Fuente añadida · @lacosmopolilla — 7 sitios, sin ruta por días",
)

assert.equal(
  extractionToastLabel({
    author: "ana",
    totalDays: null,
    items: [{}] as never,
  }),
  "Fuente añadida · @ana — 1 sitio, sin ruta por días",
)

console.log("extraction-toast: ok")
