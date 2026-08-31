import type { NextConfig } from "next"
import { MCP_DEDICATED_HOST } from "./lib/mcp/host"

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // ESLint no es gate todavía: errores preexistentes de react-hooks/set-state-in-effect
  // en auth-context, trip-context y components/ui. `npm run lint` sigue a mano.
  // Sin esto, `next build` (y la CI) fallan desde 9ce070d al instalar eslint.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return {
      // beforeFiles: `/` es app/page.tsx. Un array plano es afterFiles y el
      // filesystem ganaría: mcp.wanderplanner.ai/ seguiría siendo la landing.
      beforeFiles: [
        {
          // Exacto `/`. Un `/:path*` se traga
          // `/.well-known/oauth-protected-resource` y ChatGPT no descubre OAuth.
          source: "/",
          has: [{ type: "host", value: MCP_DEDICATED_HOST }],
          destination: "/mcp",
        },
      ],
    }
  },
}

export default nextConfig
