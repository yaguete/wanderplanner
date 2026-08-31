import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import {
  hostnameFromHeaders,
  mcpHostGate,
  mcpHostRedirectUrl,
} from "@/lib/mcp/host"
import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  // Host público: x-forwarded-host ?? host. No nextUrl.hostname: detrás del
  // proxy de Vercel esa URL puede llevar el host del deployment y la puerta
  // no se cerraría nunca (mcp.wanderplanner.ai/trips serviría la app).
  const hostname = hostnameFromHeaders(request.headers)
  if (
    mcpHostGate({ hostname, pathname: request.nextUrl.pathname }) === "redirect"
  ) {
    return NextResponse.redirect(
      mcpHostRedirectUrl(request.nextUrl.pathname, request.nextUrl.search),
      308,
    )
  }
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Protege `/trips`, `/account` y `/oauth` si no hay cookie de sesión. El
     * refresh del JWT va en el cliente (un getUser() en Edge tumbó la web con 504).
     * En mcp.wanderplanner.ai cierra el resto de la app (lib/mcp/host.ts).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
}
