import assert from "node:assert/strict"
import {
  canonicalizeMapsUrl,
  isMapsUrl,
  isShortMapsUrl,
  parseMapsCoords,
} from "./maps-links"

const PASTERZE =
  "https://www.google.com/maps/place/Pasterze/@47.0877936,12.7136183,14z/data=!4m6!3m5!1s0x477712fb74cff3d7:0x22b4da5f445f721c!8m2!3d47.0893217!4d12.7128768!16s"

{
  const coord = parseMapsCoords(PASTERZE)
  assert.ok(coord)
  assert.equal(coord!.lat, 47.0893217)
  assert.equal(coord!.lng, 12.7128768)
}

{
  const cameraOnly = "https://www.google.com/maps/@47.0877936,12.7136183,14z"
  const coord = parseMapsCoords(cameraOnly)
  assert.ok(coord)
  assert.equal(coord!.lat, 47.0877936)
  assert.equal(coord!.lng, 12.7136183)
}

{
  const q = "https://www.google.com/maps?q=47.0893217,12.7128768"
  const coord = parseMapsCoords(q)
  assert.ok(coord)
  assert.equal(coord!.lat, 47.0893217)
  assert.equal(coord!.lng, 12.7128768)
}

{
  const ll = "https://maps.google.com/?ll=47.0893217,12.7128768"
  const coord = parseMapsCoords(ll)
  assert.ok(coord)
  assert.equal(coord!.lat, 47.0893217)
  assert.equal(coord!.lng, 12.7128768)
}

{
  const dir = "https://www.google.com/maps/dir/Madrid/Barcelona/@40.4,-3.7,7z"
  assert.equal(parseMapsCoords(dir), null)
}

{
  const search = "https://www.google.com/maps/search/?api=1&query=47.08,12.71"
  assert.equal(parseMapsCoords(search), null)
}

{
  const myMaps =
    "https://www.google.com/maps/d/u/0/viewer?mid=abc&ll=61.975995437685185,-150.48649725&z=6"
  assert.equal(isMapsUrl(myMaps), true)
  assert.equal(parseMapsCoords(myMaps), null)
}

{
  const origin = "https://www.google.com/maps/@0,0,3z"
  assert.equal(parseMapsCoords(origin), null)
}

{
  const outOfRange = "https://www.google.com/maps/@99.0,12.7,14z"
  assert.equal(parseMapsCoords(outOfRange), null)
}

{
  const short = "https://maps.app.goo.gl/6odjmewhn9iZtAZF9"
  assert.equal(isMapsUrl(short), true)
  assert.equal(isShortMapsUrl(short), true)
  assert.equal(parseMapsCoords(short), null)
  assert.equal(
    canonicalizeMapsUrl(`${short}?g_st=ic`),
    "https://maps.app.goo.gl/6odjmewhn9iZtAZF9",
  )
}

{
  const legacy = "https://goo.gl/maps/abc123"
  assert.equal(isShortMapsUrl(legacy), true)
  assert.equal(parseMapsCoords(legacy), null)
}

{
  assert.equal(isMapsUrl("https://www.booking.com/hotel/at/x.html"), false)
  assert.equal(isMapsUrl("https://civitatis.com/es/viena"), false)
  assert.equal(isShortMapsUrl("https://www.google.com/maps/place/Pasterze"), false)
}

console.log("maps-links: ok")
