import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isSameOriginRequest } from "@/lib/mcp/same-origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function safeExternalRedirect(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.toString()
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  // CSRF: este POST mina un código OAuth y el `authorization_id` se liga al usuario
  // que aprueba. No dependemos solo de `SameSite=Lax`. Ver lib/mcp/same-origin.ts.
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 })
  }

  const formData = await request.formData()
  const authorizationId = String(formData.get("authorization_id") ?? "").trim()
  const decision = String(formData.get("decision") ?? "").trim()

  if (!authorizationId) {
    return NextResponse.json({ error: "Falta authorization_id" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  if (!claims || claims.is_anonymous === true) {
    return NextResponse.json({ error: "Necesitas una cuenta" }, { status: 401 })
  }

  const result =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error?.message || "No se pudo completar la autorización" },
      { status: 400 },
    )
  }

  const target = safeExternalRedirect(result.data.redirect_url)
  if (!target) {
    return NextResponse.json({ error: "Redirect inválido" }, { status: 400 })
  }

  return NextResponse.redirect(target, 303)
}
