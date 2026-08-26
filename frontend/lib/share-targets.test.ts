import assert from "node:assert/strict"
import { SITE_URL } from "./site"
import {
  DEEP_LINK_HREF_MAX,
  MAILTO_HREF_MAX,
  SHARE_FOOTER,
  SHARE_LENGTH_REASON,
  canNativeShare,
  shareTargetsFor,
  withShareFooter,
} from "./share-targets"

{
  const text = "Hola, ¿te echo el plan de Kioto?"
  const out = withShareFooter(text)
  assert.ok(out.startsWith(text))
  assert.ok(out.endsWith("Montada con wanderplanner.ai"))
  assert.equal(withShareFooter(out), out)
}

{
  const text = "Ruta con ñ y acentos: Japón\nDía 1 · Tokio"
  const targets = shareTargetsFor(text, { tripName: "Japón 7 días", nativeAvailable: false })
  assert.equal(targets.copy, true)
  assert.equal(targets.native, false)

  const wa = targets.whatsapp.href
  assert.ok(wa)
  assert.ok(wa.startsWith("https://wa.me/?text="))
  assert.ok(wa.includes(encodeURIComponent("Japón")))
  assert.ok(wa.includes("%0A") || wa.includes(encodeURIComponent("\n")))

  const tg = targets.telegram.href
  assert.ok(tg)
  assert.ok(tg.startsWith("https://t.me/share/url?"))
  assert.ok(tg.includes(`url=${encodeURIComponent(SITE_URL)}`))
  assert.ok(tg.includes("text="))

  const mail = targets.email.href
  assert.ok(mail)
  assert.ok(mail.startsWith("mailto:?subject="))
  assert.ok(mail.includes(encodeURIComponent("Japón 7 días")))
  assert.ok(mail.includes("body="))
  assert.ok(mail.includes(encodeURIComponent("Japón")))
}

{
  const huge = "x".repeat(5000)
  const targets = shareTargetsFor(huge, { tripName: "Largo", nativeAvailable: true })
  assert.equal(targets.native, true)
  assert.equal(targets.copy, true)
  assert.equal(targets.whatsapp.href, null)
  assert.equal(targets.whatsapp.reason, SHARE_LENGTH_REASON)
  assert.equal(targets.telegram.href, null)
  assert.equal(targets.email.href, null)
  assert.ok(targets.email.reason)
}

{
  const mid = "y".repeat(900)
  const targets = shareTargetsFor(mid, { tripName: "Medio" })
  assert.ok(targets.whatsapp.href)
  assert.ok((targets.whatsapp.href?.length ?? 0) <= DEEP_LINK_HREF_MAX)
  assert.ok(targets.telegram.href)
  assert.ok(targets.email.href)
  assert.ok((targets.email.href?.length ?? 0) <= MAILTO_HREF_MAX)
}

{
  const long = "Día 3 · Kenai y los tajos\n- mañana en el sendero y comida en el chiringuito\n".repeat(22)
  assert.ok(long.length > 1400)
  const targets = shareTargetsFor(long, { tripName: "Alaska, USA — 20 días" })
  const mail = targets.email.href
  assert.ok(mail)
  assert.ok(mail.startsWith("mailto:?"))
  assert.ok(mail.includes("subject="))
  assert.ok(mail.includes("body="))
  assert.ok(!/^mailto:[^?]/.test(mail))
}

{
  assert.equal(canNativeShare(), false)
  assert.ok(SHARE_FOOTER.includes("wanderplanner.ai"))
}

console.log("share-targets: ok")
