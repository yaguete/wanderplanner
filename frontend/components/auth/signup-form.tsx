"use client"

/**
 * Formulario de registro. `/signup` lo envuelve en AuthShell (variante completa);
 * la landing monta la variante compacta (nombre, email, contraseña).
 */
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TravelerProfileFields } from "@/components/auth/traveler-profile-fields"
import { Turnstile, isTurnstileEnabled } from "@/components/auth/turnstile"
import { useAuth } from "@/lib/auth-context"
import type { FavoriteReferenceInput } from "@/lib/db/profile-repo"
import { cn } from "@/lib/utils"

export function SignupForm({
  variant = "full",
  next = "/trips",
  className,
}: {
  variant?: "full" | "compact"
  next?: string
  className?: string
}) {
  const router = useRouter()
  const { signUp, isGuest, upgradeGuest, user, isLoading } = useAuth()
  const compact = variant === "compact"

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

  if (!isLoading && user && !isGuest) {
    return (
      <div className={cn("flex flex-col items-center gap-3 text-center", className)}>
        <p className="text-sm text-foreground/70">Ya estás dentro.</p>
        <Button asChild className="h-11 w-full">
          <Link href="/trips">Ir a tus viajes</Link>
        </Button>
      </div>
    )
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
      travelerTypes: compact ? [] : travelerTypes,
      travelerNotes: compact ? null : travelerNotes.trim() || null,
      favoriteReferences: compact ? [] : references,
    }
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

  const prefix = compact ? "landing-" : ""

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("flex flex-col", compact ? "gap-4" : "gap-6", className)}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 text-left">
          <Label htmlFor={`${prefix}name`}>Nombre</Label>
          <Input
            id={`${prefix}name`}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Yago"
          />
        </div>

        <div className="flex flex-col gap-1.5 text-left">
          <Label htmlFor={`${prefix}email`}>Email</Label>
          <Input
            id={`${prefix}email`}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
          />
        </div>

        <div className="flex flex-col gap-1.5 text-left">
          <Label htmlFor={`${prefix}password`}>Contraseña</Label>
          <Input
            id={`${prefix}password`}
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>

      {compact ? null : (
        <>
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
        </>
      )}

      {captchaEnabled ? (
        <Turnstile
          key={captchaKey}
          onToken={setCaptchaToken}
          appearance={compact ? "interaction-only" : "always"}
        />
      ) : null}

      {error ? <p className="text-left text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-left text-sm text-muted-foreground">{notice}</p> : null}

      <Button
        type="submit"
        className="h-11"
        disabled={submitting || (captchaEnabled && !captchaToken)}
      >
        {submitting ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  )
}
