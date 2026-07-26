import Link from "next/link"
import { BrandMark } from "@/components/app-header"
import { Button } from "@/components/ui/button"

/** Landing placeholder: se rediseñará más adelante. */
export default function RootPage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_15%_0%,hsl(221_83%_53%/0.18),transparent_60%),radial-gradient(100%_80%_at_100%_100%,hsl(221_83%_53%/0.12),transparent_55%)]"
      />

      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-sm font-semibold tracking-tight">WanderPlanner</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Entrar</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Crear cuenta</Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-center px-6 pb-24 pt-10 sm:px-10">
        <div className="mx-auto w-full max-w-3xl text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Los viajes que lees, convertidos en tu itinerario
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Pega el artículo de tu bloguero favorito y WanderPlanner lo ordena en días,
            con un asistente que conoce tus fuentes y tu forma de viajar.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 w-full px-7 sm:w-auto">
              <Link href="/signup">Empezar a planificar</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 w-full px-7 sm:w-auto">
              <Link href="/login">Ya tengo cuenta</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}
