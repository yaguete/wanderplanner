import assert from "node:assert/strict"
import { collapsingHeaderIntent } from "./collapsing-header"

assert.equal(
  collapsingHeaderIntent({ top: 120, delta: 20, expandOnScrollUp: false }),
  "collapse",
  "bajar por el documento repliega",
)
assert.equal(
  collapsingHeaderIntent({ top: 120, delta: -20, expandOnScrollUp: false }),
  "ignore",
  "subir no recupera el cromo en Fuentes / Mi viaje",
)
assert.equal(
  collapsingHeaderIntent({ top: 120, delta: -20, expandOnScrollUp: true }),
  "expand",
  "el dock (y el cromo del asistente / desktop) sí recuperan al subir",
)
assert.equal(
  collapsingHeaderIntent({ top: 40, delta: 20, expandOnScrollUp: false }),
  "ignore",
  "cerca del techo aún no repliega",
)
assert.equal(
  collapsingHeaderIntent({ top: 120, delta: 3, expandOnScrollUp: false }),
  "ignore",
  "un delta minúsculo no cuenta como gesto",
)

console.log("collapsing-header: ok")
