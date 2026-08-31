import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { SITE_URL } from "./site"
import {
  emailConfirmIsRecovery,
  emailConfirmNext,
  parseEmailConfirmType,
} from "./auth-email-confirm"

assert.equal(parseEmailConfirmType("signup"), "signup")
assert.equal(parseEmailConfirmType("email_change"), "email_change")
assert.equal(parseEmailConfirmType("recovery"), "recovery")

assert.equal(parseEmailConfirmType("magiclink"), null)
assert.equal(parseEmailConfirmType("invite"), null)
assert.equal(parseEmailConfirmType("email"), null)
assert.equal(parseEmailConfirmType("SIGNUP"), null)
assert.equal(parseEmailConfirmType("Signup"), null)
assert.equal(parseEmailConfirmType(""), null)
assert.equal(parseEmailConfirmType(null), null)
assert.equal(parseEmailConfirmType(undefined), null)
assert.equal(parseEmailConfirmType("signup "), null)
assert.equal(parseEmailConfirmType("nonesuch"), null)

assert.equal(emailConfirmNext("signup", null), "/trips")
assert.equal(emailConfirmNext("signup", undefined), "/trips")
assert.equal(emailConfirmNext("signup", ""), "/trips")
assert.equal(emailConfirmNext("signup", "/trips"), "/trips")
assert.equal(emailConfirmNext("email_change", "/trips?confirmed=1"), "/trips?confirmed=1")
assert.equal(emailConfirmNext("recovery", "/reset-password"), "/reset-password")
assert.equal(
  emailConfirmNext("recovery", null),
  "/reset-password",
  "recovery sin next no puede caer en /trips",
)
assert.equal(emailConfirmNext("recovery", undefined), "/reset-password")
assert.equal(emailConfirmNext("recovery", ""), "/reset-password")

assert.equal(emailConfirmNext("signup", "//evil.com"), "/trips")
assert.equal(emailConfirmNext("signup", "https://evil.com"), "/trips")
assert.equal(emailConfirmNext("signup", "https://evil.com/trips"), "/trips")
assert.equal(
  emailConfirmNext("recovery", "//evil.com"),
  "/reset-password",
  "open-redirect en recovery usa el fallback de recovery",
)

// `searchParams.get("next")` ya decodifica. El valor que llega aquí es
// `/trips?confirmed=1`, no el `%3F` de la plantilla. Un `?` crudo en la URL
// del correo (sin encode) no entra en `next`: sería una query hermana.
assert.equal(emailConfirmNext("email_change", "/trips?confirmed=1"), "/trips?confirmed=1")

assert.equal(emailConfirmIsRecovery("recovery", "/trips"), true)
assert.equal(emailConfirmIsRecovery("signup", "/reset-password"), true)
assert.equal(emailConfirmIsRecovery(null, "/reset-password"), true)
assert.equal(emailConfirmIsRecovery("signup", "/trips"), false)
assert.equal(emailConfirmIsRecovery("email_change", "/trips?confirmed=1"), false)
assert.equal(emailConfirmIsRecovery(null, "/trips"), false)

{
  const templatesDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "supabase",
    "email-templates",
  )
  const templates = [
    { file: "confirm-signup.html", type: "signup", next: "next=/trips" },
    {
      file: "change-email-address.html",
      type: "email_change",
      next: "next=/trips%3Fconfirmed%3D1",
    },
    { file: "reset-password.html", type: "recovery", next: "next=/reset-password" },
  ] as const

  for (const t of templates) {
    const html = readFileSync(join(templatesDir, t.file), "utf8")
    assert.equal(html.includes("{{ .ConfirmationURL }}"), false, `${t.file}: ConfirmationURL es PKCE`)
    assert.equal(
      html.includes("{{ .SiteURL }}/"),
      false,
      `${t.file}: SiteURL trae barra final; no concatenar`,
    )
    assert.equal(html.includes("//auth/confirm"), false, `${t.file}: doble barra`)
    assert.match(
      html,
      new RegExp(`${SITE_URL.replace(/[/.]/g, "\\$&")}/auth/confirm\\?token_hash=`),
    )
    assert.match(html, new RegExp(`type=${t.type}`))
    assert.ok(html.includes(t.next), `${t.file} debe llevar ${t.next}`)
    assert.ok(html.includes("{{ .TokenHash }}"), `${t.file} usa TokenHash`)
    assert.equal(
      html.includes("mismo navegador"),
      false,
      `${t.file}: el enlace vale en cualquier navegador`,
    )
  }
}

console.log("auth-email-confirm: ok")
