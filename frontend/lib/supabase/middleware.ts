import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import {
  SESSION_PERSIST_COOKIE,
  applyPersistMode,
  parsePersistMode,
} from "@/lib/auth-session-persist"
import {
  GET_USER_BUDGET_MS,
  hasSupabaseAuthCookie,
  isProtectedPath,
  withTimeout,
} from "@/lib/supabase/middleware-guard"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

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

  // Sin JWT no hay nada que refrescar. Un getUser() a GoTrue desde Edge es lo
  // que acaba en MIDDLEWARE_INVOCATION_TIMEOUT (504) y tumba hasta /login.
  if (!hasToken) {
    if (isProtected) return redirectToLogin(request)
    return NextResponse.next({ request })
  }

  // Landing, login, /start… no esperan a Auth. El refresh va al entrar a /trips.
  if (!isProtected) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return redirectToLogin(request)
  }

  const mode = parsePersistMode(request.cookies.get(SESSION_PERSIST_COOKIE)?.value)

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, applyPersistMode(mode, options ?? {}))
        }
      },
    },
  })

  // Refresca el token si toca. Presupuesto corto: si GoTrue no contesta, no
  // 504. Hay cookie de sesión; el cliente puede refrescar. Solo redirigimos
  // cuando Auth responde que no hay usuario (token inválido / cuenta borrada).
  const raced = await withTimeout(supabase.auth.getUser(), GET_USER_BUDGET_MS)
  if (raced === "timeout") return response

  const user = raced.data.user
  if (!user) return redirectToLogin(request)

  return response
}
