"use client"

/**
 * Entrada del CTA de blogs amigos: `/start?source=<url>&ref=<partner>`.
 *
 * Abre sesión (anónima si no hay ninguna), crea un viaje borrador con el `referrer` y salta al
 * detalle con `?source=`, donde se lanza la extracción. La caché `article_extractions` hace que
 * el artículo del partner esté normalmente listo al instante.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { BrandMark } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Turnstile, isTurnstileEnabled } from "@/components/auth/turnstile"
import { useAuth } from "@/lib/auth-context"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { insertDraftTrip } from "@/lib/db/trips-repo"

function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.replace(/^www\./i, "")
  } catch {
    return null
  }
}

function StartFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading, signInAnonymously } = useAuth()

  const sourceUrl = searchParams.get("source")?.trim() || ""
  const referrer = searchParams.get("ref")?.trim() || null
  const isValidSource = /^https?:\/\//i.test(sourceUrl)

  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(false)

  const needsCaptcha = isTurnstileEnabled() && !user && !captchaToken

  const start = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    setError(null)

    try {
      if (!user) {
        const result = await signInAnonymously({
          referrer,
          captchaToken: captchaToken ?? undefined,
        })
        if (!result.ok) {
          startedRef.current = false
          setError(result.error)
          return
        }
        // El id del usuario llega por `onAuthStateChange`; el efecto reintenta con sesión.
        return
      }

      const supabase = createClient()
      const name = hostnameOf(sourceUrl) ? `Viaje desde ${hostnameOf(sourceUrl)}` : "Mi viaje"
      const tripId = await insertDraftTrip(supabase, user.id, { name, referrer })
      const query = isValidSource ? `?source=${encodeURIComponent(sourceUrl)}` : ""
      router.replace(`/trips/${tripId}${query}`)
    } catch {
      startedRef.current = false
      setError("No hemos podido preparar tu viaje. Vuelve a intentarlo.")
    }
  }, [captchaToken, isValidSource, referrer, router, signInAnonymously, sourceUrl, user])

  useEffect(() => {
    if (isLoading || !isSupabaseConfigured() || needsCaptcha) return
    void start()
  }, [isLoading, needsCaptcha, start])

  // Tras la sesión anónima, `user` cambia y hay que continuar con la creación del viaje.
  useEffect(() => {
    if (user) startedRef.current = false
  }, [user])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex items-center gap-2.5">
        <BrandMark />
        <span className="text-sm font-semibold tracking-tight">WanderPlanner</span>
      </div>

      {error ? (
        <>
          <p className="max-w-sm text-sm text-destructive">{error}</p>
          <Button asChild variant="outline">
            <Link href="/">Ir al inicio</Link>
          </Button>
        </>
      ) : needsCaptcha ? (
        <>
          <p className="max-w-sm text-sm text-muted-foreground">
            Un segundo: confirma que no eres un robot y preparamos tu viaje.
          </p>
          <Turnstile onToken={setCaptchaToken} />
        </>
      ) : (
        <>
          <Spinner className="size-5 text-muted-foreground" />
          <p className="max-w-sm text-balance text-sm text-muted-foreground">
            Preparando tu viaje con el artículo que estabas leyendo…
          </p>
        </>
      )}
    </main>
  )
}

export default function StartPage() {
  return (
    <Suspense fallback={null}>
      <StartFlow />
    </Suspense>
  )
}
