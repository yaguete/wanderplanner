import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

/** Solo rutas internas. Rechaza `//evil.com` y cualquier cosa que no empiece por `/`. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/trips"
  return raw
}

/** Intercambia el código de confirmación o de recuperación por una sesión con cookies. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = safeNext(searchParams.get("next"))
  const recovery = next === "/reset-password"
  const failUrl = recovery
    ? `${origin}/forgot-password?error=link`
    : `${origin}/login?error=auth`

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(failUrl)
}
