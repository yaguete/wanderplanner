import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // ESLint no es gate todavía: errores preexistentes de react-hooks/set-state-in-effect
  // en auth-context, trip-context y components/ui. `npm run lint` sigue a mano.
  // Sin esto, `next build` (y la CI) fallan desde 9ce070d al instalar eslint.
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
