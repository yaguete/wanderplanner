import assert from "node:assert/strict"
import {
  canonicalInstagramUrl,
  instagramEmbedUrl,
  isInstagramHost,
  isInstagramMediaUrl,
  parseInstagramShortcode,
  sourceKindFromUrl,
  unsupportedSourceUrlMessage,
} from "./instagram-url"

const CASE_A =
  "https://www.instagram.com/p/DblDYKZjOhx/?utm_source=ig_web_copy_link&igsi=MzRlODBiNWFlZA=="
const CASE_B =
  "https://www.instagram.com/reel/DbYAsLVM7Yd/?utm_source=ig_web_copy_link&igsi=MzRlODBiNWFlZA=="

assert.equal(parseInstagramShortcode(CASE_A), "DblDYKZjOhx")
assert.equal(parseInstagramShortcode(CASE_B), "DbYAsLVM7Yd")
assert.equal(
  canonicalInstagramUrl(CASE_A),
  "https://www.instagram.com/p/DblDYKZjOhx",
)
assert.equal(
  canonicalInstagramUrl(CASE_B),
  "https://www.instagram.com/p/DbYAsLVM7Yd",
)
assert.equal(
  instagramEmbedUrl(CASE_A),
  "https://www.instagram.com/p/DblDYKZjOhx/embed/",
)
assert.equal(
  instagramEmbedUrl(CASE_B),
  "https://www.instagram.com/p/DbYAsLVM7Yd/embed/",
)
assert.equal(instagramEmbedUrl("https://www.instagram.com/lacosmopolilla"), null)

assert.equal(
  parseInstagramShortcode("https://instagram.com/p/DblDYKZjOhx/"),
  "DblDYKZjOhx",
)
assert.equal(
  parseInstagramShortcode("https://m.instagram.com/reel/DbYAsLVM7Yd"),
  "DbYAsLVM7Yd",
)
assert.equal(
  parseInstagramShortcode("https://www.instagram.com/reels/DbYAsLVM7Yd/"),
  "DbYAsLVM7Yd",
)
assert.equal(
  parseInstagramShortcode(
    "https://www.instagram.com/lacosmopolilla/p/DblDYKZjOhx/",
  ),
  "DblDYKZjOhx",
)
assert.equal(
  parseInstagramShortcode(
    "https://www.instagram.com/lacosmopolilla/reel/DbYAsLVM7Yd",
  ),
  "DbYAsLVM7Yd",
)
assert.equal(
  parseInstagramShortcode("https://instagr.am/p/DblDYKZjOhx"),
  "DblDYKZjOhx",
)

assert.equal(isInstagramMediaUrl("https://www.instagram.com/lacosmopolilla"), false)
assert.equal(isInstagramMediaUrl("https://www.instagram.com/stories/lacosmopolilla/123"), false)
assert.equal(isInstagramMediaUrl("https://www.instagram.com/explore/tags/cornwall"), false)
assert.equal(isInstagramMediaUrl("https://www.instagram.com/reel/"), false)
assert.equal(isInstagramMediaUrl("https://lacosmopolilla.com/ruta"), false)

assert.equal(isInstagramHost("www.instagram.com"), true)
assert.equal(isInstagramHost("m.instagram.com"), true)
assert.equal(isInstagramHost("instagr.am"), true)
assert.equal(isInstagramHost("tiktok.com"), false)

assert.equal(sourceKindFromUrl(CASE_A), "instagram")
assert.equal(sourceKindFromUrl("https://lacosmopolilla.com/ruta"), "article")

assert.match(
  unsupportedSourceUrlMessage("https://www.tiktok.com/@x/video/1") ?? "",
  /TikTok y YouTube/,
)
assert.match(
  unsupportedSourceUrlMessage("https://youtu.be/abc") ?? "",
  /TikTok y YouTube/,
)
assert.match(
  unsupportedSourceUrlMessage("https://www.instagram.com/lacosmopolilla") ?? "",
  /perfiles, stories/,
)
assert.equal(unsupportedSourceUrlMessage(CASE_A), null)
assert.equal(unsupportedSourceUrlMessage("https://lacosmopolilla.com/ruta"), null)

console.log("instagram-url: ok")
