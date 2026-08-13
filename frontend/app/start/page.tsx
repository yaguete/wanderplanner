"use client"

/**
 * Entrada del CTA de blogs amigos: `/start?source=<url>&ref=<partner>&days=<N>`.
 *
 * Abre sesión (anónima si no hay ninguna), crea un viaje borrador con el `referrer` y salta al
 * detalle con `?source=`, donde se lanza la extracción. La caché `article_extractions` hace que
 * el artículo del partner esté normalmente listo al instante.
 *
 * `&days=N` (opcional, 1..60) fuerza la duración del borrador desde el post del blogger;
 * tiene prioridad sobre `total_days` de la extracción.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { BrandLockup } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Turnstile, isTurnstileEnabled } from "@/components/auth/turnstile"
import { useAuth } from "@/lib/auth-context"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { insertDraftTrip } from "@/lib/db/trips-repo"
import { draftTripNameFor, parseDaysParam } from "@/lib/partner-trip"

function errorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message) return error.message
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }
  return null
}

function StartFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading, signInAnonymously } = useAuth()

  const sourceUrl = searchParams.get("source")?.trim() || ""
  const referrer = searchParams.get("ref")?.trim() || null
  const forcedDays = parseDaysParam(searchParams.get("days"))
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
      const supabase = createClient()
      let userId: string | undefined

      // Una sesión anónima puede seguir en el navegador después de que la limpieza periódica
      // haya borrado su fila de auth.users. Validarla evita insertar un viaje con un FK huérfano.
      if (user) {
        const { data, error: userError } = await supabase.auth.getUser()
        if (!userError && data.user) {
          userId = data.user.id
        } else {
          await supabase.auth.signOut({ scope: "local" })
          startedRef.current = false
          return
        }
      }

      if (!userId) {
        const result = await signInAnonymously({
          referrer,
          captchaToken: captchaToken ?? undefined,
        })
        if (!result.ok) {
          startedRef.current = false
          setError(result.error)
          return
        }
        // Continuar en esta misma ejecución evita una carrera entre el efecto de arranque y
        // `onAuthStateChange`: el cambio de usuario puede renderizar antes de liberar startedRef.
        const { data, error: userError } = await supabase.auth.getUser()
        if (userError || !data.user) {
          throw userError ?? new Error("No se pudo recuperar la sesión invitada.")
        }
        userId = data.user.id
      }

      const name = draftTripNameFor(sourceUrl)
      const tripId = await insertDraftTrip(supabase, userId, {
        name,
        referrer,
        numDays: forcedDays,
      })
      const query = isValidSource ? `?source=${encodeURIComponent(sourceUrl)}` : ""
      router.replace(`/trips/${tripId}${query}`)
    } catch (error) {
      startedRef.current = false
      const detail = errorMessage(error)
      console.error("No se pudo preparar el viaje desde /start", error)
      setError(
        process.env.NODE_ENV === "development" && detail
          ? `No hemos podido preparar tu viaje: ${detail}`
          : "No hemos podido preparar tu viaje. Vuelve a intentarlo.",
      )
    }
  }, [captchaToken, forcedDays, isValidSource, referrer, router, signInAnonymously, sourceUrl, user])

  useEffect(() => {
    if (isLoading || !isSupabaseConfigured() || needsCaptcha) return
    void start()
  }, [isLoading, needsCaptcha, start])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandLockup />

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
