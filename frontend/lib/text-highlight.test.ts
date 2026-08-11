import assert from "node:assert/strict"
import { findMatchRanges, foldForSearch } from "./text-highlight"

// Plegado: acentos y mayúsculas
{
  const { folded, map } = foldForSearch("Schönbrunn")
  assert.equal(folded, "schonbrunn")
  assert.equal(map.length, folded.length)
  assert.equal(map[0], 0) // S
  // ö (U+00F6) → o; el índice original del primer code unit de ö es 1
  assert.equal(map[1], 1)
}

{
  const { folded } = foldForSearch("DÍA")
  assert.equal(folded, "dia")
}

{
  const { folded } = foldForSearch("España")
  assert.equal(folded, "espana")
}

// findMatchRanges: tilde en haystack, no en needle
{
  const ranges = findMatchRanges("Visita a Schönbrunn hoy", "schonbrunn")
  assert.equal(ranges.length, 1)
  assert.equal(ranges[0]!.start, 9)
  assert.equal(ranges[0]!.end, 19)
  assert.equal("Visita a Schönbrunn hoy".slice(ranges[0]!.start, ranges[0]!.end), "Schönbrunn")
}

// findMatchRanges: tilde en needle
{
  const ranges = findMatchRanges("dia 1 y día 2", "día")
  assert.equal(ranges.length, 2)
  assert.equal("dia 1 y día 2".slice(ranges[0]!.start, ranges[0]!.end), "dia")
  assert.equal("dia 1 y día 2".slice(ranges[1]!.start, ranges[1]!.end), "día")
}

// Mayúsculas
{
  const ranges = findMatchRanges("Viena y VIENA", "viena")
  assert.equal(ranges.length, 2)
}

// Metacaracteres de RegExp: no deben romper ni interpretarse
{
  const ranges = findMatchRanges("precio (aprox) 20€", "(aprox)")
  assert.equal(ranges.length, 1)
  assert.equal("precio (aprox) 20€".slice(ranges[0]!.start, ranges[0]!.end), "(aprox)")
}

{
  assert.deepEqual(findMatchRanges("foo [bar]", "[bar]"), [{ start: 4, end: 9 }])
  assert.deepEqual(findMatchRanges("a*b", "a*b"), [{ start: 0, end: 3 }])
}

// Cadena vacía / solo espacios
{
  assert.deepEqual(findMatchRanges("hola", ""), [])
  assert.deepEqual(findMatchRanges("hola", "   "), [])
  assert.deepEqual(findMatchRanges("", "hola"), [])
}

// Sin solapes: "aaa" con needle "aa" → un match al inicio
{
  const ranges = findMatchRanges("aaa", "aa")
  assert.equal(ranges.length, 1)
  assert.deepEqual(ranges[0], { start: 0, end: 2 })
}

// Tope max
{
  const ranges = findMatchRanges("x x x x", "x", 2)
  assert.equal(ranges.length, 2)
}

console.log("text-highlight: ok")
