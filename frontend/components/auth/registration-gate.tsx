"use client"

/**
 * Puerta de registro para invitados (sesión anónima). Envuelve `/trips` y expone
 * `requireAccount(reason)`: devuelve `true` si la acción puede seguir, o abre la modal y
 * devuelve `false` cuando quien la intenta es un invitado.
 *
 * El registro usa `updateUser` sobre el mismo `user_id`, así que el viaje que ya ha planificado
 * se conserva sin migración.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth-context"

export type GateReason = "new-trip" | "second-source" | "home"

const COPY: Record<GateReason, { title: string; description: string }> = {
  "new-trip": {
    title: "Crea tu cuenta para empezar otro viaje",
    description:
      "Tu viaje actual se guarda tal cual. Con cuenta podrás tener varios y volver a ellos desde cualquier dispositivo.",
  },
  "second-source": {
    title: "Crea tu cuenta para añadir más fuentes",
    description:
      "Combina varios artículos en un mismo itinerario y no pierdas lo que ya has consolidado.",
  },
  home: {
    title: "Crea tu cuenta para acceder a tus viajes",
    description:
      "Guarda lo que has planificado y recupéralo cuando quieras, aquí o en el móvil.",
  },
}

type GateValue = {
  /** `true` si la acción puede continuar; `false` si se ha abierto la modal de registro. */
  requireAccount: (reason: GateReason) => boolean
}

const RegistrationGateContext = createContext<GateValue | null>(null)

export function RegistrationGateProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isGuest, upgradeGuest, linkGuestEmail } = useAuth()
  const [reason, setReason] = useState<GateReason | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const requireAccount = useCallback(
    (nextReason: GateReason) => {
      if (!isGuest) return true
      setError(null)
      setNotice(null)
      setReason(nextReason)
      return false
    },
    [isGuest],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    const result = await upgradeGuest({
      email: email.trim(),
      password,
      displayName: name.trim() || null,
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setReason(null)
    router.refresh()
  }

  const handleMagicLink = async () => {
    if (!email.trim()) {
      setError("Escribe tu email para recibir el enlace.")
      return
    }
    setError(null)
    setSubmitting(true)
    // Misma sesión anónima: updateUser({ email }) envía la confirmación sin crear otro user.
    const result = await linkGuestEmail(email.trim(), name.trim() || null)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(
      "Te hemos enviado un enlace de confirmación. Al abrirlo, este viaje queda ligado a tu email.",
    )
  }

  const value = useMemo<GateValue>(() => ({ requireAccount }), [requireAccount])
  const copy = reason ? COPY[reason] : null

  return (
    <RegistrationGateContext.Provider value={value}>
      {children}
      <Dialog open={reason !== null} onOpenChange={(open) => !open && setReason(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy?.title}</DialogTitle>
            <DialogDescription>{copy?.description}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gate-name">Nombre</Label>
              <Input
                id="gate-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gate-email">Email</Label>
              <Input
                id="gate-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gate-password">Contraseña</Label>
              <Input
                id="gate-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

            <Button type="submit" className="h-11" disabled={submitting}>
              {submitting ? "Guardando…" : "Crear cuenta y guardar mi viaje"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              onClick={() => void handleMagicLink()}
              disabled={submitting}
            >
              Prefiero un enlace por email
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </RegistrationGateContext.Provider>
  )
}

export function useRegistrationGate(): GateValue {
  const ctx = useContext(RegistrationGateContext)
  // Fuera del provider (p. ej. rutas públicas) nunca hay puerta que abrir.
  return ctx ?? { requireAccount: () => true }
}
