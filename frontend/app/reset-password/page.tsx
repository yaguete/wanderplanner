"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { AuthShell } from "@/components/auth/auth-shell"
import { PasswordInput } from "@/components/auth/password-input"
import { useAuth } from "@/lib/auth-context"
import { MIN_PASSWORD_LENGTH, validatePasswordPair } from "@/lib/account-security"

export default function ResetPasswordPage() {
  const router = useRouter()
  const { user, isLoading, isGuest, updatePassword } = useAuth()
  const [nextPassword, setNextPassword] = useState("")
  const [repeatPassword, setRepeatPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const sessionReady = !isLoading && user && !isGuest
  const sessionMissing = !isLoading && (!user || isGuest)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validation = validatePasswordPair(nextPassword, repeatPassword)
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    setSaving(true)
    const result = await updatePassword({ current: null, next: nextPassword })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push("/trips")
  }

  return (
    <AuthShell
      title="Elige una contraseña nueva"
      subtitle={sessionReady ? "La anterior deja de valer en cuanto la cambies." : undefined}
      footer={
        sessionMissing ? (
          <>
            <Link
              href="/forgot-password"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Pedir otro enlace
            </Link>
          </>
        ) : null
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : sessionMissing ? (
        <p className="text-sm text-muted-foreground">
          El enlace ha caducado o se ha abierto en otro navegador. Pide uno nuevo e ábrelo
          aquí mismo.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">Nueva contraseña</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repeat-password">Repetir contraseña</Label>
            <PasswordInput
              id="repeat-password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="h-11" disabled={saving}>
            {saving ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
