"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthShell } from "@/components/auth/auth-shell"
import { useAuth } from "@/lib/auth-context"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn, sendMagicLink } = useAuth()
  const next = searchParams.get("next") || "/trips"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    const result = await signIn(email.trim(), password)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(next)
    router.refresh()
  }

  const handleMagicLink = async () => {
    if (!email.trim()) {
      setError("Escribe tu email para recibir el enlace.")
      return
    }
    setError(null)
    setSubmitting(true)
    const result = await sendMagicLink(email.trim())
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice("Te hemos enviado un enlace de acceso. Revisa tu correo.")
  }

  return (
    <AuthShell
      title="Entra en tu cuenta"
      subtitle="Sigue planificando donde lo dejaste."
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
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        <Button type="submit" className="mt-1 h-11" disabled={submitting}>
          {submitting ? "Entrando…" : "Entrar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10"
          onClick={handleMagicLink}
          disabled={submitting}
        >
          Enviarme un enlace de acceso
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
