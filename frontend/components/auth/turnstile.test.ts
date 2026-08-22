import assert from "node:assert/strict"
import { turnstileFailureMessage } from "./turnstile"

assert.equal(
  turnstileFailureMessage("load"),
  "No se pudo cargar el captcha de Cloudflare. Desactiva el bloqueador para challenges.cloudflare.com o recarga.",
)
assert.equal(
  turnstileFailureMessage("widget", "110200"),
  "Este host no está en el widget de Turnstile. Añade localhost (o 127.0.0.1) en Hostname management.",
)
assert.equal(
  turnstileFailureMessage("widget", "110100"),
  "La clave del captcha no es válida. Revisa NEXT_PUBLIC_TURNSTILE_SITE_KEY.",
)
assert.equal(turnstileFailureMessage("timeout"), "El captcha no terminó a tiempo. Reinténtalo.")
assert.equal(turnstileFailureMessage("widget"), "No se pudo verificar el captcha. Reinténtalo.")
assert.equal(turnstileFailureMessage("widget", "empty"), "No se pudo verificar el captcha. Reinténtalo.")

console.log("turnstile: ok")
