import assert from "node:assert/strict"
import { AUTH_ERROR_FALLBACK, AUTH_EMAIL_EXISTS, authErrorMessage, isDuplicateSignUp } from "./auth-errors"

assert.equal(
  authErrorMessage({ message: "A user with this email address has already been registered" }),
  AUTH_EMAIL_EXISTS,
)
assert.equal(
  authErrorMessage({ code: "email_exists", message: "User already registered" }),
  AUTH_EMAIL_EXISTS,
)

assert.equal(authErrorMessage({ message: "{}" }), "El email no es válido.")
assert.equal(authErrorMessage({ message: {} }), "El email no es válido.")
assert.equal(
  authErrorMessage({ code: "validation_failed", message: "{}" }),
  "El email no es válido.",
)
assert.equal(
  authErrorMessage({
    code: "validation_failed",
    message: "Unable to validate email address: invalid format",
  }),
  "El email no es válido.",
)
assert.equal(
  authErrorMessage({ code: "email_address_invalid" }),
  "El email no es válido.",
)

assert.equal(
  authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" }),
  "Email o contraseña incorrectos.",
)
assert.equal(
  authErrorMessage({ message: "Email not confirmed" }),
  "Confirma el email antes de entrar.",
)
assert.equal(
  authErrorMessage({ message: "Password should be at least 6 characters" }),
  "La contraseña debe tener al menos 6 caracteres.",
)
assert.equal(
  authErrorMessage({
    message: "For security purposes, you can only request this after 60 seconds.",
  }),
  "Espera un minuto antes de pedir otro.",
)
assert.equal(
  authErrorMessage({ code: "over_request_rate_limit" }),
  "Espera un minuto antes de pedir otro.",
)
assert.equal(
  authErrorMessage({ code: "over_email_send_rate_limit", message: "email rate limit exceeded" }),
  "Hemos enviado demasiados correos. Espera un momento.",
)
assert.equal(authErrorMessage({ message: "captcha verification failed" }), "Confirma que no eres un robot.")

assert.equal(authErrorMessage(null), AUTH_ERROR_FALLBACK)
assert.equal(authErrorMessage(""), AUTH_ERROR_FALLBACK)
assert.equal(authErrorMessage({ message: "" }), AUTH_ERROR_FALLBACK)

assert.equal(authErrorMessage("No hay sesión."), "No hay sesión.")
assert.equal(authErrorMessage(new Error("Supabase no está configurado.")), "Supabase no está configurado.")

assert.equal(isDuplicateSignUp({ user: { identities: [] }, session: null }), true)
assert.equal(isDuplicateSignUp({ user: { identities: [{ id: "1" }] }, session: null }), false)
assert.equal(isDuplicateSignUp({ user: { identities: [] }, session: { access_token: "x" } }), false)
assert.equal(isDuplicateSignUp({ user: null, session: null }), false)

console.log("auth-errors.test.ts: ok")
