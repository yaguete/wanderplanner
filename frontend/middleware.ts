import type { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Protege `/trips`, `/account` y `/oauth` si no hay cookie de sesión. El
     * refresh del JWT va en el cliente (un getUser() en Edge tumbó la web con 504).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
}
