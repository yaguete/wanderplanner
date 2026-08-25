import type { Metadata, Viewport } from "next"
import { Inter, Newsreader } from "next/font/google"
import { AuthProvider } from "@/lib/auth-context"
import { AnalyticsGate } from "@/components/analytics-gate"
import { CookieBanner } from "@/components/cookie-banner"
import { Toaster } from "@/components/ui/sonner"
import { SITE_URL } from "@/lib/site"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

/** Solo la Crónica (`.prose-article`). `preload: false` para no costearla en la landing. */
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
  preload: false,
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "WanderPlanner",
    template: "%s · WanderPlanner",
  },
  description:
    "El primer planificador editorial de viajes impulsado por IA. Pega las fuentes y blogueros de tu confianza y WanderPlanner lo convierte en un plan de viaje para ti, día a día.",
  openGraph: { type: "website", locale: "es_ES", siteName: "WanderPlanner" },
  twitter: { card: "summary_large_image" },
}

/** En móvil, el layout se encoge con el teclado (Chrome/Android) en vez de solaparlo. */
export const viewport: Viewport = {
  interactiveWidget: "resizes-content",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${newsreader.variable} font-sans antialiased`}>
        <AuthProvider>
          {children}
          <Toaster />
          <CookieBanner />
        </AuthProvider>
        <AnalyticsGate />
      </body>
    </html>
  )
}
