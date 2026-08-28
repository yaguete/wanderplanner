"use client"

/**
 * Puerta de registro para invitados (sesión anónima). Envuelve `/trips` y expone
 * `requireAccount(reason)`: devuelve `true` si la acción puede seguir, o abre la modal y
 * devuelve `false` cuando quien la intenta es un invitado.
 *
 * El registro usa `updateUser` sobre el mismo `user_id`, así que el viaje que ya ha planificado
 * se conserva sin migración. «Ya tengo cuenta» prepara un claim, hace `signIn` a la cuenta
 * existente y `claim_guest_trips` reasigna el viaje en la hidratación.
 *
 * Si el invitado ya envió email/contraseña pero aún no ha confirmado el correo, la modal
 * muestra el estado «pendiente de confirmación» en lugar de pedir el formulario otra vez.
 * Mientras sigue siendo invitado, la modal reaparece sola cada 3 minutos (si no hay otra
 * abierta) para incentivar el registro.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
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
import { isTurnstileEnabled } from "@/components/auth/turnstile"
import { ThemedTurnstile } from "@/components/auth/themed-turnstile"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import { RememberMeCheckbox } from "@/components/auth/remember-me-checkbox"
import { useAuth } from "@/lib/auth-context"
import { persistModeFromRemember } from "@/lib/auth-session-persist"
import { writeSessionPersistMode } from "@/lib/supabase/client"
import { useTrips } from "@/lib/trip-context"
import { createClient } from "@/lib/supabase/client"
import {
  clearStash,
  prepareGuestTripClaim,
} from "@/lib/guest-trip-claim"
import { MIN_PASSWORD_LENGTH, validatePasswordPair } from "@/lib/account-security"
import {
  postSlugFromSourceUrl,
  recordAccountCreated,
  recordGateShown,
} from "@/lib/funnel-analytics"

export type GateReason =
  | "new-trip"
  | "second-source"
  | "home"
  | "source-limit"
  | "assistant-limit"
  | "invite"
  | "share-plan"

type GateMode = "signup" | "login"

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
    title: "Crea tu cuenta para guardar tu viaje",
    description:
      "Añade más fuentes, guarda lo que has planificado y recupéralo cuando quieras, aquí o en el móvil.",
  },
  "source-limit": {
    title: "Crea tu cuenta para combinar más fuentes",
    description:
      "Con una cuenta puedes añadir todos los artículos que quieras al mismo viaje y seguir planificando sin límite de invitado.",
  },
  "assistant-limit": {
    title: "Crea tu cuenta para seguir con el asistente",
    description:
      "El asistente te ayuda a afinar el plan. Con cuenta tienes más mensajes y tu viaje queda guardado.",
  },
  invite: {
    title: "Crea tu cuenta para invitar a este viaje",
    description:
      "Las invitaciones van a un correo. Con cuenta puedes invitar a quien viaja contigo y editar el plan a la vez.",
  },
  "share-plan": {
    title: "Crea tu cuenta para compartir tu ruta",
    description:
      "Guardamos el texto con tu viaje para que puedas volver a enviarlo sin escribirlo otra vez.",
  },
}

const GUEST_SIGNUP_NUDGE_MS = 3 * 60 * 1000

type GateValue = {
  /** `true` si la acción puede continuar; `false` si se ha abierto la modal de registro. */
  requireAccount: (reason: GateReason) => boolean
  /** La modal de registro está en pantalla: el onboarding no debe autoabrir encima. */
  isOpen: boolean
}

const RegistrationGateContext = createContext<GateValue | null>(null)

function pendingEmailOf(user: User | null | undefined): string | null {
  if (!user) return null
  const candidate = (user.new_email ?? user.email)?.trim()
  return candidate || null
}

export function RegistrationGateProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, isGuest, upgradeGuest, linkGuestEmail, refreshGuestStatus, signIn } = useAuth()
  const { flushPendingSync, pendingSources, trips, getTripSources } = useTrips()
  const [reason, setReason] = useState<GateReason | null>(null)
  const [mode, setMode] = useState<GateMode>("signup")
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordRepeat, setPasswordRepeat] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const keepClaimRef = useRef(false)
  const captchaEnabled = isTurnstileEnabled()
  const extractionLoading = pendingSources.some((p) => p.status === "loading")

  const pendingEmail = pendingEmailOf(user)
  const hasPendingUpgrade = Boolean(isGuest && pendingEmail)

  const requireAccount = useCallback(
    (nextReason: GateReason) => {
      if (!isGuest) return true
      setError(null)
      setNotice(null)
      setMode("signup")
      setPendingConfirm(hasPendingUpgrade)
      if (hasPendingUpgrade && pendingEmail) {
        setEmail(pendingEmail)
      }
      setReason(nextReason)
      return false
    },
    [isGuest, hasPendingUpgrade, pendingEmail],
  )
  const requireAccountRef = useRef(requireAccount)
  requireAccountRef.current = requireAccount

  useEffect(() => {
    if (!isGuest || reason !== null) return
    let timeoutId = 0
    const schedule = (ms: number) => {
      timeoutId = window.setTimeout(tick, ms)
    }
    const tick = () => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        schedule(15_000)
        return
      }
      requireAccountRef.current("home")
    }
    schedule(GUEST_SIGNUP_NUDGE_MS)
    return () => window.clearTimeout(timeoutId)
  }, [isGuest, reason])

  // `reason` pasa de null a un motivo exactamente cuando la modal se pone en pantalla,
  // así que este efecto emite una vez por apertura sin depender de los call sites.
  useEffect(() => {
    if (reason === null) return
    recordGateShown(reason)
  }, [reason])

  const resetGateState = () => {
    setReason(null)
    setPendingConfirm(false)
    setMode("signup")
    setError(null)
    setNotice(null)
    setSubmitting(false)
  }

  const closeGate = () => {
    if (!keepClaimRef.current) clearStash()
    keepClaimRef.current = false
    resetGateState()
  }

  const resetCaptcha = () => {
    setCaptchaToken(null)
    setCaptchaKey((key) => key + 1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (!name.trim()) {
      setError("Escribe tu nombre.")
      return
    }
    const passwordError = validatePasswordPair(password, passwordRepeat)
    if (passwordError) {
      setError(passwordError)
      return
    }
    setSubmitting(true)
    writeSessionPersistMode(persistModeFromRemember(rememberMe))
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
    const trip = trips.find((t) => t.referrer) ?? trips[0]
    const firstUrl = trip ? getTripSources(trip.id)[0]?.url : undefined
    recordAccountCreated({
      ref: trip?.referrer ?? undefined,
      postSlug: firstUrl ? postSlugFromSourceUrl(firstUrl) ?? undefined : undefined,
    })
    // Con confirmación de email activada, sigue siendo invitado hasta confirmar.
    // Mostramos el estado pendiente en lugar de cerrar en silencio.
    const stillGuest = await refreshGuestStatus()
    if (stillGuest) {
      setPendingConfirm(true)
      setNotice(null)
      return
    }
    keepClaimRef.current = true
    resetGateState()
    router.refresh()
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (extractionLoading) {
      setError("Espera a que termine de leer el artículo.")
      return
    }
    if (captchaEnabled && !captchaToken) {
      setError("Confirma que no eres un robot.")
      return
    }
    if (!user?.id) {
      setError("No hay sesión de invitado.")
      return
    }
    setSubmitting(true)
    const flushed = await flushPendingSync()
    if (!flushed) {
      setSubmitting(false)
      setError("No hemos podido guardar los últimos cambios. Inténtalo de nuevo.")
      return
    }
    const prepared = await prepareGuestTripClaim(createClient(), user.id)
    if (!prepared.ok) {
      setSubmitting(false)
      setError(prepared.error)
      return
    }
    writeSessionPersistMode(persistModeFromRemember(rememberMe))
    const result = await signIn(email.trim(), password, captchaToken ?? undefined)
    if (!result.ok) {
      clearStash()
      resetCaptcha()
      setSubmitting(false)
      setError(result.error)
      return
    }
    keepClaimRef.current = true
    const goHome = reason === "home" || reason === "new-trip"
    resetGateState()
    router.refresh()
    if (goHome) router.push("/trips")
  }

  const goForgotPassword = async () => {
    setError(null)
    setNotice(null)
    if (extractionLoading) {
      setError("Espera a que termine de leer el artículo.")
      return
    }
    setSubmitting(true)
    const flushed = await flushPendingSync()
    setSubmitting(false)
    if (!flushed) {
      setError("No hemos podido guardar los últimos cambios. Inténtalo de nuevo.")
      return
    }
    keepClaimRef.current = true
    router.push("/forgot-password")
  }

  const handleAlreadyConfirmed = async () => {
    setError(null)
    setNotice(null)
    setSubmitting(true)
    const stillGuest = await refreshGuestStatus()
    setSubmitting(false)
    if (stillGuest) {
      setError(
        "Aún no hemos detectado la confirmación. Revisa el correo (también la carpeta de spam) y vuelve a intentarlo.",
      )
      return
    }
    keepClaimRef.current = true
    resetGateState()
    router.refresh()
  }

  const handleResend = async () => {
    const target = (pendingEmail ?? email).trim()
    if (!target) {
      setError("No hay un email al que reenviar el enlace.")
      return
    }
    setError(null)
    setSubmitting(true)
    const result = await linkGuestEmail(target, name.trim() || null)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(`Te hemos reenviado el enlace a ${target}.`)
  }

  const value = useMemo<GateValue>(
    () => ({ requireAccount, isOpen: reason !== null }),
    [requireAccount, reason],
  )
  const copy = reason ? COPY[reason] : null
  const displayPendingEmail = pendingEmail ?? email.trim()
  const loginBlocked = submitting || extractionLoading || (captchaEnabled && !captchaToken)

  return (
    <RegistrationGateContext.Provider value={value}>
      {children}
      <Dialog
        open={reason !== null}
        onOpenChange={(open) => {
          if (!open) closeGate()
        }}
      >
        <DialogContent className="sm:max-w-md">
          {pendingConfirm ? (
            <>
              <DialogHeader>
                <DialogTitle>Confirma tu email para continuar</DialogTitle>
                <DialogDescription>
                  {displayPendingEmail
                    ? `Te hemos enviado un correo a ${displayPendingEmail}. Ábrelo y confirma tu cuenta; después pulsa el botón de abajo.`
                    : "Te hemos enviado un correo de confirmación. Ábrelo y confirma tu cuenta; después pulsa el botón de abajo."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
                <Button
                  type="button"
                  className="h-11"
                  disabled={submitting}
                  onClick={() => void handleAlreadyConfirmed()}
                >
                  {submitting ? "Comprobando…" : "Ya lo he confirmado"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10"
                  disabled={submitting}
                  onClick={() => void handleResend()}
                >
                  Reenviar enlace
                </Button>
              </div>
            </>
          ) : mode === "login" ? (
            <>
              <DialogHeader>
                <DialogTitle>Entra en tu cuenta</DialogTitle>
                <DialogDescription>
                  Tu viaje actual se añadirá a esta cuenta.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => void handleLogin(e)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gate-login-email">Email</Label>
                  <Input
                    id="gate-login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gate-login-password">Contraseña</Label>
                  <Input
                    id="gate-login-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    disabled={submitting}
                    onClick={() => void goForgotPassword()}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                <RememberMeCheckbox
                  id="gate-login-remember-me"
                  checked={rememberMe}
                  onCheckedChange={setRememberMe}
                />

                {captchaEnabled ? (
                  <ThemedTurnstile key={captchaKey} resetKey={captchaKey} onToken={setCaptchaToken} />
                ) : null}

                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                {extractionLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Espera a que termine de leer el artículo.
                  </p>
                ) : null}

                <Button type="submit" className="h-11" disabled={loginBlocked}>
                  {submitting ? "Entrando…" : "Entrar y guardar mi viaje"}
                </Button>
                <GoogleSignInButton
                  next="/trips"
                  rememberMe={rememberMe}
                  claimUserId={user?.id}
                  disabled={submitting || extractionLoading}
                  onError={(message) => setError(message || null)}
                  beforeRedirect={async () => {
                    if (extractionLoading) {
                      setError("Espera a que termine de leer el artículo.")
                      return false
                    }
                    const flushed = await flushPendingSync()
                    if (!flushed) {
                      setError("No hemos podido guardar los últimos cambios. Inténtalo de nuevo.")
                      return false
                    }
                    return true
                  }}
                  onKeepClaim={() => {
                    keepClaimRef.current = true
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10"
                  disabled={submitting}
                  onClick={() => {
                    setError(null)
                    setNotice(null)
                    setMode("signup")
                  }}
                >
                  Crear cuenta
                </Button>
              </form>
            </>
          ) : (
            <>
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
                    required
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
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gate-password-repeat">Repetir contraseña</Label>
                  <Input
                    id="gate-password-repeat"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    value={passwordRepeat}
                    onChange={(e) => setPasswordRepeat(e.target.value)}
                  />
                </div>

                <RememberMeCheckbox
                  id="gate-remember-me"
                  checked={rememberMe}
                  onCheckedChange={setRememberMe}
                />

                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

                <Button type="submit" className="h-11" disabled={submitting}>
                  {submitting ? "Guardando…" : "Crear cuenta y guardar mi viaje"}
                </Button>
                <GoogleSignInButton
                  next="/trips"
                  rememberMe={rememberMe}
                  claimUserId={user?.id}
                  disabled={submitting || extractionLoading}
                  onError={(message) => setError(message || null)}
                  beforeRedirect={async () => {
                    if (extractionLoading) {
                      setError("Espera a que termine de leer el artículo.")
                      return false
                    }
                    const flushed = await flushPendingSync()
                    if (!flushed) {
                      setError("No hemos podido guardar los últimos cambios. Inténtalo de nuevo.")
                      return false
                    }
                    return true
                  }}
                  onKeepClaim={() => {
                    keepClaimRef.current = true
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 text-muted-foreground"
                  disabled={submitting}
                  onClick={() => {
                    setError(null)
                    setNotice(null)
                    setPassword("")
                    setPasswordRepeat("")
                    setMode("login")
                  }}
                >
                  Ya tengo cuenta
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </RegistrationGateContext.Provider>
  )
}

export function useRegistrationGate(): GateValue {
  const ctx = useContext(RegistrationGateContext)
  // Fuera del provider (p. ej. rutas públicas) nunca hay puerta que abrir.
  return ctx ?? { requireAccount: () => true, isOpen: false }
}
