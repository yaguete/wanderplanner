"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthShell } from "@/components/auth/auth-shell"
import { Turnstile, isTurnstileEnabled } from "@/components/auth/turnstile"
import { useAuth } from "@/lib/auth-context"
import { createClient } from "@/lib/supabase/client"
import { clearStash, prepareGuestTripClaim } from "@/lib/guest-trip-claim"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn, isGuest, user } = useAuth()
  const next = searchParams.get("next") || "/trips"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const captchaEnabled = isTurnstileEnabled()

  const resetCaptcha = () => {
    setCaptchaToken(null)
    setCaptchaKey((key) => key + 1)
  }

  /**
   * `/login` vive fuera de `/trips`: no hay `useTrips()` ni flush. El
   * TripProvider ya hace flush al desmontar, fire-and-forget (~1 s de riesgo).
   * El camino bueno es la modal de RegistrationGate.
   */
  const prepareIfGuest = async (): Promise<boolean> => {
    if (!isGuest) return true
    if (!user?.id) {
      setError("No hay sesión de invitado.")
      return false
    }
    const prepared = await prepareGuestTripClaim(createClient(), user.id)
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
    const result = await signIn(email.trim(), password, captchaToken ?? undefined)
    setSubmitting(false)
    if (!result.ok) {
      clearStash()
      resetCaptcha()
      setError(result.error)
      return
    }
    router.push(next)
    router.refresh()
  }

  return (
    <AuthShell
      title="Entra en tu cuenta"
      subtitle={
        isGuest
          ? "Tu viaje actual se añadirá a esta cuenta."
          : "Sigue planificando donde lo dejaste."
      }
      footer={
        <>
          ¿Aún no tienes cuenta?{" "}
          <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
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
          <Input
            id="password"
            type="password"
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

        {captchaEnabled ? <Turnstile key={captchaKey} onToken={setCaptchaToken} /> : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button
          type="submit"
          className="mt-1 h-11"
          disabled={submitting || (captchaEnabled && !captchaToken)}
        >
          {submitting ? "Entrando…" : isGuest ? "Entrar y guardar mi viaje" : "Entrar"}
        </Button>
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
