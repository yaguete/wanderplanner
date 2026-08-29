import { NextResponse, type NextRequest } from "next/server"
import {
  hasSupabaseAuthCookie,
  isProtectedPath,
  middlewareGate,
} from "@/lib/supabase/middleware-guard"

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = "/login"
  url.search = ""
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`
  url.searchParams.set("next", next.startsWith("/") ? next : request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const isProtected = isProtectedPath(pathname)
  const hasToken = hasSupabaseAuthCookie(request.cookies.getAll())

  // Sin red a GoTrue. Un getUser() desde Edge fue 504 en toda la web y, cuando
  // no se colgaba, 1–5 s extra al abrir un viaje (el cliente ya refresca).
  // `/oauth/consent` entra por cookie, igual que `/trips`: el JWT lo refresca el cliente.
  if (middlewareGate({ isProtected, hasToken }) === "login") {
    return redirectToLogin(request)
  }

  return NextResponse.next({ request })
}
