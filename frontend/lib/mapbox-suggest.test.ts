/**
 * suggestPlaces / suggestPlacesSession / retrievePlace: propósito, types, bbox
 * y fallback v5. Fetch simulado; sin llamadas de pago.
 */
process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.test"

import assert from "node:assert/strict"

type FetchCall = { url: string }
let calls: FetchCall[] = []

function stubFetch(handler: (url: string) => Promise<Response>) {
  calls = []
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    calls.push({ url })
    return handler(url)
  }) as typeof fetch
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function main() {
  const {
    retrievePlace,
    suggestPlaces,
    suggestPlacesResult,
    suggestPlacesSession,
  } = await import("./mapbox")

  {
    stubFetch(async (url) => {
      assert.ok(url.includes("/search/searchbox/v1/forward"))
      assert.ok(url.includes("types=place%2Cregion%2Cdistrict") || url.includes("types=place,region,district"))
      return json({
        features: [
          {
            properties: {
              mapbox_id: "edi",
              name: "Edimburgo",
              feature_type: "place",
              place_formatted: "Escocia, Reino Unido",
              coordinates: { longitude: -3.18, latitude: 55.95 },
              context: { country: { country_code: "gb" } },
            },
          },
          {
            properties: {
              mapbox_id: "bar",
              name: "Edimburgo bar",
              feature_type: "poi",
              coordinates: { longitude: -3.7, latitude: 40.42 },
            },
          },
        ],
      })
    })
    const list = await suggestPlaces("Edimburgo", { purpose: "city" })
    assert.equal(list.length, 1)
    assert.equal(list[0]!.text, "Edimburgo")
    assert.equal(list[0]!.featureType, "place")
    assert.equal(calls.length, 1, "con hits de Search Box no cae a v5")
  }

  {
    stubFetch(async (url) => {
      if (url.includes("/searchbox/v1/forward")) {
        return json({ features: [] })
      }
      assert.ok(url.includes("/geocoding/v5/mapbox.places/"))
      assert.ok(url.includes("types=place"))
      assert.ok(url.includes("bbox="))
      return json({
        features: [
          {
            id: "place.1",
            text: "Edimburgo",
            place_name: "Edimburgo, Escocia",
            center: [-3.18, 55.95],
          },
        ],
      })
    })
    const list = await suggestPlaces("Edimburgo", {
      purpose: "city",
      bbox: [-4, 55, -2, 57],
    })
    assert.equal(list[0]!.provider, "geocoding-v5")
    assert.equal(list[0]!.text, "Edimburgo")
    assert.equal(calls.length, 2)
  }

  {
    stubFetch(async (url) => {
      if (url.includes("/searchbox/v1/forward")) return json({ features: [] })
      throw new Error("v5 no debe llamarse para purpose=poi")
    })
    const result = await suggestPlacesResult("Hostel One", { purpose: "poi" })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.items.length, 0)
    assert.equal(calls.length, 1)
  }

  {
    stubFetch(async (url) => json({ message: "nope" }, 403))
    const result = await suggestPlacesResult("Edimburgo", { purpose: "city" })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.reason, "http")
      assert.equal(result.status, 403)
    }
  }

  {
    stubFetch(async (url) => {
      assert.ok(url.includes("/searchbox/v1/suggest"))
      assert.ok(url.includes("session_token=tok-1"))
      assert.ok(url.includes("types=place"))
      return json({
        suggestions: [
          {
            name: "Edimburgo",
            mapbox_id: "mbx-edi",
            feature_type: "place",
            place_formatted: "Escocia, Reino Unido",
            context: { country: { country_code: "gb" } },
          },
          {
            name: "Edimburgo bar",
            mapbox_id: "mbx-bar",
            feature_type: "poi",
          },
        ],
      })
    })
    const result = await suggestPlacesSession("Edimb", "tok-1", { purpose: "city" })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.items.length, 1)
      assert.equal(result.items[0]!.center, undefined)
      assert.equal(result.items[0]!.mapboxId, "mbx-edi")
      assert.equal(result.items[0]!.sessionToken, "tok-1")
    }
  }

  {
    stubFetch(async (url) => {
      assert.ok(url.includes("/searchbox/v1/retrieve/mbx-edi"))
      assert.ok(url.includes("session_token=tok-1"))
      return json({
        features: [
          {
            properties: {
              mapbox_id: "mbx-edi",
              name: "Edimburgo",
              feature_type: "place",
              full_address: "Edimburgo, Escocia, Reino Unido",
              coordinates: { longitude: -3.188, latitude: 55.953 },
              bbox: [-3.38, 55.87, -3.07, 56.01],
              context: { country: { country_code: "gb" } },
            },
          },
        ],
      })
    })
    const result = await retrievePlace({
      id: "mbx-edi",
      provider: "searchbox",
      text: "Edimburgo",
      placeName: "Escocia, Reino Unido",
      featureType: "place",
      countryCode: "GB",
      mapboxId: "mbx-edi",
      sessionToken: "tok-1",
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.place.center.lng, -3.188)
      assert.deepEqual(result.place.bbox, [-3.38, 55.87, -3.07, 56.01])
    }
  }

  {
    stubFetch(async () => {
      throw new Error("v5 no va a /retrieve")
    })
    const result = await retrievePlace({
      id: "v5-1",
      provider: "geocoding-v5",
      text: "Soportújar",
      placeName: "Soportújar, Granada",
      featureType: "place",
      countryCode: "ES",
      center: { lng: -3.4, lat: 36.9 },
    })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.place.center.lat, 36.9)
    assert.equal(calls.length, 0, "v5 no va a /retrieve")
  }

  {
    stubFetch(async () => json({ message: "nope" }, 401))
    const result = await suggestPlacesResult("Edimburgo", { purpose: "city" })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.status, 401)
  }

  {
    stubFetch(async () => json({ message: "slow down" }, 429))
    const result = await suggestPlacesSession("Edimb", "tok-rate", { purpose: "city" })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.reason, "http")
      assert.equal(result.status, 429)
    }
  }

  {
    stubFetch(async (url) => {
      if (url.includes("/suggest")) return json({ suggestions: [] })
      if (url.includes("/geocoding/v5/")) return json({ features: [] })
      throw new Error(url)
    })
    const result = await suggestPlacesSession("xyzzy", "tok-empty", { purpose: "city" })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.items.length, 0)
    assert.equal(calls.length, 2)
  }

  {
    stubFetch(async () => {
      throw new TypeError("network down")
    })
    const result = await suggestPlacesResult("Edimburgo", { purpose: "city" })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "network")
  }

  console.log("mapbox-suggest: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
