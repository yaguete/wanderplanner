import assert from "node:assert/strict"
import type { User } from "@supabase/supabase-js"
import {
  confirmationNameFor,
  matchesAccountConfirmation,
  validatePasswordChange,
} from "./account-security"
import type { TravelerProfile } from "./db/profile-repo"

function user(partial: {
  email?: string
  is_anonymous?: boolean
  user_metadata?: Record<string, unknown>
}): User {
  return {
    id: "u1",
    app_metadata: {},
    user_metadata: partial.user_metadata ?? {},
    aud: "authenticated",
    created_at: "",
    email: partial.email,
    is_anonymous: partial.is_anonymous,
  } as User
}

function profile(displayName: string | null): TravelerProfile {
  return {
    id: "u1",
    displayName,
    travelerTypes: [],
    travelerNotes: null,
    signupReferrer: null,
  }
}

assert.equal(matchesAccountConfirmation("", "Yago"), false)
assert.equal(matchesAccountConfirmation("Yago", ""), false)
assert.equal(matchesAccountConfirmation("   ", "Yago"), false)
assert.equal(matchesAccountConfirmation("Yago", "Yago"), true)
assert.equal(matchesAccountConfirmation("  yago  ", "Yago"), true)
assert.equal(matchesAccountConfirmation("Yago  López", "Yago López"), true)
assert.equal(matchesAccountConfirmation("José", "jose"), false, "los acentos cuentan")
assert.equal(matchesAccountConfirmation("José", "José"), true)
assert.equal(matchesAccountConfirmation("Cafe\u0301", "Café"), true, "NFC")
assert.equal(matchesAccountConfirmation("y.lopezlosada", "y.lopezlosada"), true)

assert.equal(confirmationNameFor(user({ email: "a@b.com" }), profile("Yago")), "Yago")
assert.equal(
  confirmationNameFor(user({ email: "y.lopezlosada@gmail.com" }), profile(null)),
  "y.lopezlosada",
)
assert.equal(
  confirmationNameFor(
    user({ email: "a@b.com", user_metadata: { display_name: "Ana" } }),
    profile(null),
  ),
  "Ana",
)
assert.equal(
  confirmationNameFor(user({ is_anonymous: true }), null),
  "Invitado",
)

assert.equal(
  validatePasswordChange({
    current: "",
    next: "secret1",
    repeat: "secret1",
    requiresCurrent: true,
  }),
  "Escribe tu contraseña actual.",
)
assert.equal(
  validatePasswordChange({
    current: "oldpass",
    next: "123",
    repeat: "123",
    requiresCurrent: true,
  }),
  "La nueva contraseña debe tener al menos 6 caracteres.",
)
assert.equal(
  validatePasswordChange({
    current: "oldpass",
    next: "secret1",
    repeat: "secret2",
    requiresCurrent: true,
  }),
  "Las contraseñas nuevas no coinciden.",
)
assert.equal(
  validatePasswordChange({
    current: "secret1",
    next: "secret1",
    repeat: "secret1",
    requiresCurrent: true,
  }),
  "La nueva contraseña no puede ser igual a la actual.",
)
assert.equal(
  validatePasswordChange({
    current: "oldpass",
    next: "secret1",
    repeat: "secret1",
    requiresCurrent: true,
  }),
  null,
)
assert.equal(
  validatePasswordChange({
    current: "",
    next: "secret1",
    repeat: "secret1",
    requiresCurrent: false,
  }),
  null,
)

console.log("account-security tests passed")
