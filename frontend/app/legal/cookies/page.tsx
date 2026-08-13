import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Política de cookies",
  robots: { index: false, follow: true },
}

export default function CookiesPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Política de cookies</h1>
      <p className="mt-6 text-muted-foreground">
        Estamos terminando de redactar este documento. Si tienes cualquier duda,
        escríbenos a{" "}
        <a
          href="mailto:hola@wanderplanner.ai"
          className="font-medium text-foreground underline underline-offset-4"
        >
          hola@wanderplanner.ai
        </a>
        .
      </p>
      <Link href="/" className="mt-10 inline-block text-sm font-medium underline underline-offset-4">
        ← Volver al inicio
      </Link>
    </main>
  )
}
