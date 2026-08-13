import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AuthProvider } from "@/lib/auth-context"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: "WanderPlanner",
  description: "Consolida rutas de blogueros y periodistas en tu propio itinerario",
  icons: {
    icon: [{ url: "/icon-light-32x32.png", type: "image/png", sizes: "32x32" }],
  },
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
