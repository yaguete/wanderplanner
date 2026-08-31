"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthShell } from "@/components/auth/auth-shell"
import { isTurnstileEnabled } from "@/components/auth/turnstile"
import { ThemedTurnstile } from "@/components/auth/themed-turnstile"
import { useAuth } from "@/lib/auth-context"
import { AUTH_EMAIL_LINK_INVALID } from "@/lib/auth-errors"
import { createClient } from "@/lib/supabase/client"
import { prepareGuestTripClaim } from "@/lib/guest-trip-claim"

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const { requestPasswordReset, isGuest, user } = useAuth()
  const linkFailed = searchParams.get("error") === "link"

  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(
    linkFailed ? AUTH_EMAIL_LINK_INVALID : null,
  )
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const captchaEnabled = isTurnstileEnabled()

  const resetCaptcha = () => {
    setCaptchaToken(null)
    setCaptchaKey((key) => key + 1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (captchaEnabled && !captchaToken) {
      setError("Confirma que no eres un robot.")
      return
    }
    setSubmitting(true)
    if (isGuest) {
      if (!user?.id) {
        setSubmitting(false)
        setError("No hay sesión de invitado.")
        return
      }
      const prepared = await prepareGuestTripClaim(createClient(), user.id)
      if (!prepared.ok) {
        setSubmitting(false)
        setError(prepared.error)
        return
      }
    }
    const result = await requestPasswordReset(email.trim(), captchaToken ?? undefined)
    setSubmitting(false)
    resetCaptcha()
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(
      "Si hay una cuenta con ese correo, te hemos enviado un enlace. Caduca en 24 horas y vale en cualquier navegador.",
    )
  }

  return (
    <AuthShell
      title="¿Olvidaste tu contraseña?"
      subtitle="Te enviamos un enlace para elegir una nueva. Vale en cualquier navegador."
      footer={
        <>
          ¿La recuerdas?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Entrar
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

        {captchaEnabled ? (
          <ThemedTurnstile key={captchaKey} resetKey={captchaKey} onToken={setCaptchaToken} />
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        <Button
          type="submit"
          className="h-11"
          disabled={submitting || (captchaEnabled && !captchaToken)}
        >
          {submitting ? "Enviando…" : "Enviar enlace"}
        </Button>
      </form>
    </AuthShell>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  )
}
