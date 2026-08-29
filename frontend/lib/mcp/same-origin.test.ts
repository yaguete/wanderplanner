import assert from "node:assert/strict"
import { isSameOriginRequest, requestOrigin } from "./same-origin"

const SITE = "https://wanderplanner.ai"

function req(headers: Record<string, string>, url = `${SITE}/oauth/decision`) {
  return { headers: new Headers(headers), url }
}

// --- requestOrigin ---
{
  assert.equal(
    requestOrigin(req({ "x-forwarded-host": "wanderplanner.ai", "x-forwarded-proto": "https" })),
    SITE,
    "origen desde cabeceras de proxy",
  )
  assert.equal(
    requestOrigin(req({ "x-forwarded-host": "wp-git-abc.vercel.app" })),
    "https://wp-git-abc.vercel.app",
    "preview: https por defecto",
  )
  assert.equal(
    requestOrigin(req({}, "http://localhost:3000/oauth/decision")),
    "http://localhost:3000",
    "sin proxy, cae a la URL",
  )
  assert.equal(
    requestOrigin(req({ "x-forwarded-host": "a.example, b.example" })),
    "https://a.example",
    "solo el primer host de la lista",
  )
}

// --- same-origin acepta ---
{
  assert.equal(isSameOriginRequest(req({ origin: SITE })), true, "origin igual al sitio")
  assert.equal(
    isSameOriginRequest(req({ origin: `${SITE}/oauth/consent` })),
    true,
    "se compara el origen, no la URL entera",
  )
  assert.equal(
    isSameOriginRequest(
      req(
        { origin: "https://wp-git-abc.vercel.app", "x-forwarded-host": "wp-git-abc.vercel.app" },
        "https://wp-git-abc.vercel.app/oauth/decision",
      ),
    ),
    true,
    "preview: vale su propio origen",
  )
  assert.equal(
    isSameOriginRequest(req({ referer: `${SITE}/oauth/consent?authorization_id=x` })),
    true,
    "sin Origin, vale el Referer",
  )
}

// --- same-origin rechaza ---
{
  assert.equal(
    isSameOriginRequest(req({ origin: "https://evil.example" })),
    false,
    "CSRF clásico: origen ajeno",
  )
  assert.equal(
    isSameOriginRequest(req({ origin: "http://wanderplanner.ai" })),
    false,
    "el esquema forma parte del origen",
  )
  assert.equal(
    isSameOriginRequest(req({ origin: "https://wanderplanner.ai.evil.example" })),
    false,
    "sufijo que solo se parece",
  )
  assert.equal(
    isSameOriginRequest(req({ origin: "https://evil.example", referer: SITE })),
    false,
    "Origin manda: un Referer bueno no rescata un Origin malo",
  )
  assert.equal(isSameOriginRequest(req({})), false, "sin Origin ni Referer se rechaza")
  assert.equal(isSameOriginRequest(req({ origin: "null" })), false, "Origin opaco (sandbox)")
  assert.equal(
    isSameOriginRequest(req({ origin: "no-es-una-url" })),
    false,
    "Origin ilegible se rechaza, no se ignora",
  )
}

console.log("same-origin.test.ts: ok")
