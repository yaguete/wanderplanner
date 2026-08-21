import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import {
  SESSION_PERSIST_COOKIE,
  applyPersistMode,
  parsePersistMode,
} from "@/lib/auth-session-persist"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

/** Rutas que exigen sesión (anónima o registrada). */
const PROTECTED_PREFIXES = ["/trips", "/account"]

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return response

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

  // Refresca el token si toca; no quitar (mantiene viva la sesión en Server Components).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = ""
    const next = `${pathname}${request.nextUrl.search}`
    url.searchParams.set("next", next.startsWith("/") ? next : pathname)
    return NextResponse.redirect(url)
  }

  return response
}
