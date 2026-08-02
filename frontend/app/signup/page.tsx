"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AuthShell } from "@/components/auth/auth-shell"
import { TravelerProfileFields } from "@/components/auth/traveler-profile-fields"
import { Turnstile, isTurnstileEnabled } from "@/components/auth/turnstile"
import { useAuth } from "@/lib/auth-context"
import type { FavoriteReferenceInput } from "@/lib/db/profile-repo"

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signUp, isGuest, upgradeGuest } = useAuth()
  const next = searchParams.get("next") || "/trips"

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [travelerTypes, setTravelerTypes] = useState<string[]>([])
  const [travelerNotes, setTravelerNotes] = useState("")
  const [references, setReferences] = useState<FavoriteReferenceInput[]>([
    { label: "", url: "" },
  ])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const captchaEnabled = !isGuest && isTurnstileEnabled()

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

    const payload = {
      email: email.trim(),
      password,
      displayName: name.trim() || null,
      travelerTypes,
      travelerNotes: travelerNotes.trim() || null,
      favoriteReferences: references,
    }
    // Un invitado conserva su `user_id` (y sus viajes) al registrarse.
    const result = isGuest
      ? await upgradeGuest(payload)
      : await signUp({ ...payload, captchaToken: captchaToken ?? undefined })
    setSubmitting(false)

    if (!result.ok) {
      if (captchaEnabled) resetCaptcha()
      setError(result.error)
      return
    }
    setNotice(
      "Cuenta creada. Si te pedimos confirmar el email, revisa tu correo antes de entrar.",
    )
    router.push(next)
    router.refresh()
  }

  return (
    <AuthShell
      title={isGuest ? "Guarda tu viaje" : "Crea tu cuenta"}
      subtitle={
        isGuest
          ? "Conserva lo que ya has planificado y sigue desde cualquier dispositivo."
          : "Cuéntanos cómo viajas y el asistente afinará sus recomendaciones."
      }
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Yago"
            />
          </div>

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
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <TravelerProfileFields
          travelerTypes={travelerTypes}
          onTravelerTypesChange={setTravelerTypes}
          references={references}
          onReferencesChange={setReferences}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="traveler-notes">Algo más sobre cómo viajas (opcional)</Label>
          <Textarea
            id="traveler-notes"
            value={travelerNotes}
            onChange={(e) => setTravelerNotes(e.target.value)}
            placeholder="Viajo con niños pequeños, prefiero alojamientos con cocina y evito madrugones."
            rows={3}
          />
        </div>

        {captchaEnabled ? <Turnstile key={captchaKey} onToken={setCaptchaToken} /> : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        <Button
          type="submit"
          className="h-11"
          disabled={submitting || (captchaEnabled && !captchaToken)}
        >
          {submitting ? "Creando cuenta…" : "Crear cuenta"}
        </Button>
      </form>
    </AuthShell>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  )
}
