"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthShell } from "@/components/auth/auth-shell"
import { PasswordInput } from "@/components/auth/password-input"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import { RememberMeCheckbox } from "@/components/auth/remember-me-checkbox"
import { isTurnstileEnabled } from "@/components/auth/turnstile"
import { ThemedTurnstile } from "@/components/auth/themed-turnstile"
import { completeAuthNavigation, hrefWithNext, safeNext } from "@/lib/auth-next"
import { useAuth } from "@/lib/auth-context"
import { authCallbackErrorMessage } from "@/lib/auth-errors"
import { persistModeFromRemember } from "@/lib/auth-session-persist"
import { createClient, writeSessionPersistMode } from "@/lib/supabase/client"
import { clearStash, prepareGuestTripClaim } from "@/lib/guest-trip-claim"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn, isGuest, user, isLoading } = useAuth()
  const next = safeNext(searchParams.get("next"))

  useEffect(() => {
    if (isLoading) return
    if (user && !isGuest) router.replace(next)
  }, [isGuest, isLoading, next, router, user])

  useEffect(() => {
    router.prefetch(next)
  }, [next, router])

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(() =>
    authCallbackErrorMessage(searchParams.get("error")),
  )
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const [guestTripName, setGuestTripName] = useState<string | null>(null)
  const [guestTripCount, setGuestTripCount] = useState(0)
  const [addGuestTrip, setAddGuestTrip] = useState(true)
  const captchaEnabled = isTurnstileEnabled()

  const resetCaptcha = () => {
    setCaptchaToken(null)
    setCaptchaKey((key) => key + 1)
  }

  useEffect(() => {
    if (!isGuest || !user?.id) return
    const supabase = createClient()
    let active = true
    void (async () => {
      const { data, error: loadError } = await supabase
        .from("trips")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("archived", false)
        .order("updated_at", { ascending: false })
        .limit(2)
      if (!active) return
      if (loadError || !data?.length) {
        setGuestTripName(null)
        setGuestTripCount(0)
        return
      }
      const name = typeof data[0]?.name === "string" ? data[0].name.trim() : ""
      setGuestTripName(name || null)
      setGuestTripCount(data.length)
    })()
    return () => {
      active = false
    }
  }, [isGuest, user?.id])

  const hasGuestTrip = isGuest && guestTripCount > 0
  const willClaim = hasGuestTrip && addGuestTrip

  const prepareIfGuest = async (): Promise<boolean> => {
    if (!isGuest) return true
    const supabase = createClient()
    if (!user?.id) {
      setError("No hay sesión de invitado.")
      return false
    }
    if (!hasGuestTrip || !addGuestTrip) {
      await supabase.auth.signOut({ scope: "local" })
      clearStash()
      return true
    }
    const prepared = await prepareGuestTripClaim(supabase, user.id)
    if (!prepared.ok) {
      setError(prepared.error)
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (captchaEnabled && !captchaToken) {
      setError("Confirma que no eres un robot.")
      return
    }
    setSubmitting(true)
    const ready = await prepareIfGuest()
    if (!ready) {
      setSubmitting(false)
      return
    }
    writeSessionPersistMode(persistModeFromRemember(rememberMe))
    const result = await signIn(email.trim(), password, captchaToken ?? undefined)
    if (!result.ok) {
      setSubmitting(false)
      clearStash()
      resetCaptcha()
      setError(result.error)
      return
    }
    completeAuthNavigation(next)
  }

  const claimLabel = guestTripName
    ? `Añadir «${guestTripName}» a esta cuenta`
    : "Añadir el viaje que estabas viendo a esta cuenta"

  return (
    <AuthShell
      title="Entra en tu cuenta"
      subtitle={
        willClaim
          ? "Tu viaje actual se añadirá a esta cuenta."
          : "Sigue planificando donde lo dejaste."
      }
      footer={
        <>
          ¿Aún no tienes cuenta?{" "}
          <Link
            href={hrefWithNext("/signup", next)}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Crear cuenta
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Link
            href="/forgot-password"
            className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <RememberMeCheckbox
          id="remember-me"
          checked={rememberMe}
          onCheckedChange={setRememberMe}
        />

        {hasGuestTrip ? (
          <label className="flex items-start gap-2.5 text-left text-sm leading-snug">
            <Checkbox
              checked={addGuestTrip}
              onCheckedChange={(value) => setAddGuestTrip(value === true)}
              className="mt-0.5"
            />
            <span>{claimLabel}</span>
          </label>
        ) : null}

        {captchaEnabled ? <ThemedTurnstile key={captchaKey} onToken={setCaptchaToken} /> : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button
          type="submit"
          className="mt-1 h-11"
          disabled={submitting || (captchaEnabled && !captchaToken)}
        >
          {submitting ? "Entrando…" : willClaim ? "Entrar y guardar mi viaje" : "Entrar"}
        </Button>

        <GoogleSignInButton
          next={next}
          rememberMe={rememberMe}
          claimUserId={willClaim ? user?.id : undefined}
          disabled={submitting}
          onError={(message) => setError(message || null)}
        />
      </form>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
