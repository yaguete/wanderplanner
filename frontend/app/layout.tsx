import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AuthProvider } from "@/lib/auth-context"
import { Toaster } from "@/components/ui/sonner"
import { SITE_URL } from "@/lib/site"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "WanderPlanner",
    template: "%s · WanderPlanner",
  },
  description:
    "Los viajes que lees, convertidos en tu itinerario. Consolida rutas de blogueros en tu propio plan.",
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
      <body className={`${inter.variable} font-sans antialiased`}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
