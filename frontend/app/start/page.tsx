"use client"

/**
 * Entrada del CTA de blogs amigos: `/start?source=<url>&ref=<partner>&days=<N>`.
 *
 * Cuenta registrada: el viaje entra en la cuenta (el mismo artículo no clona).
 * Invitado: un solo hueco; el último CTA sustituye al anterior.
 * Nunca degrada una sesión registrada a sandbox.
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
import {
  deleteGuestSlotTrips,
  insertDraftTrip,
  loadStartCandidates,
  reuseOrInsertDraftTrip,
  type LoadedStartTrip,
} from "@/lib/db/trips-repo"
import {
  draftTripNameFor,
  parseDaysParam,
  parseRefParam,
  stashPendingSource,
} from "@/lib/partner-trip"
import { sourceMatchKey } from "@/lib/trip-sources"
import {
  decideStart,
  isDefinitivelyDeadAnonymousSession,
  type StartDecision,
} from "@/lib/start-session"
import {
  recordStartOpenedOnce,
  startOpenedGuard,
} from "@/lib/funnel-analytics"

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

function authErrorShape(error: unknown): { status?: number; code?: string } | null {
  if (!error || typeof error !== "object") return null
  const rec = error as { status?: unknown; code?: unknown }
  return {
    status: typeof rec.status === "number" ? rec.status : undefined,
    code: typeof rec.code === "string" ? rec.code : undefined,
  }
}

type ConfirmReplace = { keepTripId: string; keepName: string }

function StartFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading, signInAnonymously } = useAuth()

  const sourceUrl = searchParams.get("source")?.trim() || ""
  const referrer = parseRefParam(searchParams.get("ref"))
  const forcedDays = parseDaysParam(searchParams.get("days"))
  const isValidSource = /^https?:\/\//i.test(sourceUrl)
  const sourceKey = isValidSource ? sourceMatchKey(sourceUrl) || null : null

  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmReplace | null>(null)
  const [replacing, setReplacing] = useState(false)
  const startedRef = useRef(false)
  const pendingReplaceRef = useRef<{
    userId: string
    candidates: LoadedStartTrip[]
    deleteIds: string[]
  } | null>(null)

  const needsCaptcha = isTurnstileEnabled() && !user && !captchaToken

  const goToTrip = useCallback(
    (tripId: string, withSource: boolean) => {
      if (withSource && isValidSource) stashPendingSource(tripId, sourceUrl)
      const query = withSource && isValidSource ? `?source=${encodeURIComponent(sourceUrl)}` : ""
      router.replace(`/trips/${tripId}${query}`)
    },
    [isValidSource, router, sourceUrl],
  )

  const executeReplace = useCallback(
    async (userId: string, candidates: LoadedStartTrip[], deleteIds: string[]) => {
      const supabase = createClient()
      const name = draftTripNameFor(sourceUrl)
      const newTripId = await insertDraftTrip(supabase, userId, {
        name,
        referrer,
        numDays: forcedDays,
        seedSourceKey: sourceKey,
      })
      await deleteGuestSlotTrips(supabase, candidates, deleteIds)
      goToTrip(newTripId, true)
    },
    [forcedDays, goToTrip, referrer, sourceKey, sourceUrl],
  )

  const applyDecision = useCallback(
    async (userId: string, candidates: LoadedStartTrip[], decision: StartDecision) => {
      const supabase = createClient()
      const name = draftTripNameFor(sourceUrl)
      const draft = {
        name,
        referrer,
        numDays: forcedDays,
        seedSourceKey: sourceKey,
      }

      if (decision.kind === "open") {
        goToTrip(decision.tripId, false)
        return
      }
      if (decision.kind === "reuse") {
        const tripId = await reuseOrInsertDraftTrip(supabase, userId, draft)
        goToTrip(tripId, true)
        return
      }
      if (decision.kind === "create") {
        const tripId = await insertDraftTrip(supabase, userId, draft)
        goToTrip(tripId, true)
        return
      }
      if (decision.kind === "replace") {
        await executeReplace(userId, candidates, decision.createAndDeleteTripIds)
        return
      }
      const keep = candidates.find((c) => c.id === decision.keepTripId)
      pendingReplaceRef.current = {
        userId,
        candidates,
        deleteIds: candidates.map((c) => c.id),
      }
      setConfirm({
        keepTripId: decision.keepTripId,
        keepName: keep?.name?.trim() || "tu viaje",
      })
    },
    [executeReplace, forcedDays, goToTrip, referrer, sourceKey, sourceUrl],
  )

  const start = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    setError(null)
    setConfirm(null)

    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()

      let userId: string | undefined
      let isGuest = false

      if (session?.user && !session.user.is_anonymous) {
        userId = session.user.id
        isGuest = false
      } else if (session?.user?.is_anonymous) {
        const { data, error: userError } = await supabase.auth.getUser()
        if (data.user) {
          userId = data.user.id
          isGuest = true
        } else if (isDefinitivelyDeadAnonymousSession(authErrorShape(userError), data.user)) {
          await supabase.auth.signOut({ scope: "local" })
        } else {
          startedRef.current = false
          setError("No hemos podido comprobar tu sesión. Reinténtalo.")
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
        if (!result.userId) {
          throw new Error("No se pudo recuperar la sesión invitada.")
        }
        userId = result.userId
        isGuest = true
      }

      const candidates = await loadStartCandidates(supabase, userId)
      const decision = decideStart({
        isGuest,
        sourceKey,
        trips: candidates,
      })
      await applyDecision(userId, candidates, decision)
    } catch (caught) {
      startedRef.current = false
      const detail = errorMessage(caught)
      console.error("No se pudo preparar el viaje desde /start", caught)
      setError(
        process.env.NODE_ENV === "development" && detail
          ? `No hemos podido preparar tu viaje: ${detail}`
          : "No hemos podido preparar tu viaje. Vuelve a intentarlo.",
      )
    }
  }, [applyDecision, captchaToken, referrer, signInAnonymously, sourceKey])

  useEffect(() => {
    // Independiente de Turnstile: este es el denominador del embudo.
    // Si se cuelga de `start()` (que espera el captcha) el evento deja de medir el abandono.
    if (
      !startOpenedGuard({
        authLoading: isLoading,
        supabaseConfigured: isSupabaseConfigured(),
      })
    ) {
      return
    }
    recordStartOpenedOnce({ ref: referrer, sourceUrl })
  }, [isLoading, referrer, sourceUrl])

  useEffect(() => {
    if (isLoading || !isSupabaseConfigured() || needsCaptcha) return
    void start()
  }, [isLoading, needsCaptcha, start])

  const onKeepExisting = () => {
    if (!confirm) return
    goToTrip(confirm.keepTripId, false)
  }

  const onReplaceAnyway = async () => {
    const pending = pendingReplaceRef.current
    if (!pending) return
    setReplacing(true)
    setError(null)
    try {
      await executeReplace(pending.userId, pending.candidates, pending.deleteIds)
    } catch (caught) {
      startedRef.current = false
      setReplacing(false)
      const detail = errorMessage(caught)
      setError(
        process.env.NODE_ENV === "development" && detail
          ? `No hemos podido preparar tu viaje: ${detail}`
          : "No hemos podido preparar tu viaje. Vuelve a intentarlo.",
      )
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandLockup />

      {error ? (
        <>
          <p className="max-w-sm text-sm text-destructive">{error}</p>
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                startedRef.current = false
                void start()
              }}
            >
              Reintentar
            </Button>
            <Button asChild variant="ghost">
              <Link href="/">Ir al inicio</Link>
            </Button>
          </div>
        </>
      ) : confirm ? (
        <>
          <div className="max-w-sm space-y-2 text-balance">
            <p className="text-sm text-foreground">
              Ya tenías un viaje empezado: «{confirm.keepName}».
            </p>
            <p className="text-sm text-muted-foreground">
              Como invitado solo puedes tener uno a la vez.
            </p>
            <p className="text-sm text-muted-foreground">
              ¿Quieres conservar los dos? Crea una cuenta y no perderás ninguno.
            </p>
          </div>
          <div className="flex w-full max-w-sm flex-col gap-2">
            <Button type="button" onClick={onKeepExisting} disabled={replacing}>
              Seguir con {confirm.keepName}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onReplaceAnyway()}
              disabled={replacing}
            >
              {replacing ? "Preparando…" : "Empezar con este artículo (se perderá el anterior)"}
            </Button>
            <Button asChild variant="ghost">
              <Link href="/signup">Crear cuenta</Link>
            </Button>
          </div>
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
