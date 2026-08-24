"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthShell } from "@/components/auth/auth-shell"
import { Turnstile, isTurnstileEnabled } from "@/components/auth/turnstile"
import { useAuth } from "@/lib/auth-context"
import { lookupInvite, completeInviteSignup, type InviteLookup } from "@/lib/trip-share-api"
import { invitePath, inviterLabel, tripIdFromAcceptPayload, tripPathAfterAccept } from "@/lib/trip-invite-url"
import { createClient } from "@/lib/supabase/client"
import { MIN_PASSWORD_LENGTH, validatePasswordPair } from "@/lib/account-security"

export function InviteAccept({ token }: { token: string }) {
  const router = useRouter()
  const { user, isGuest, isLoading, signIn, signOut } = useAuth()
  const [info, setInfo] = useState<InviteLookup | null>(null)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void lookupInvite(token).then(setInfo)
  }, [token])

  const joinTrip = async () => {
    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc("accept_trip_invite", { p_token: token })
    if (rpcError) throw rpcError
    const tripId = tripIdFromAcceptPayload(data)
    if (!tripId) throw new Error("No se pudo aceptar la invitación")
    window.location.assign(tripPathAfterAccept(tripId))
  }

  if (!info || isLoading) {
    return (
      <AuthShell title="Invitación">
        <p className="text-sm text-muted-foreground">Cargando invitación…</p>
      </AuthShell>
    )
  }

  if (info.status !== "valid") {
    return (
      <AuthShell title="Invitación">
        <h1 className="text-lg font-semibold">
          {info.status === "expired" ? "Esta invitación ha caducado" : "No encontramos esa invitación"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pídele a quien te invitó que te la reenvíe.
        </p>
        <Button asChild className="mt-4">
          <Link href="/trips">Ir a mis viajes</Link>
        </Button>
      </AuthShell>
    )
  }

  const tripName = info.tripName || "un viaje"
  const inviter = inviterLabel(info.inviterName)
  const inviteEmail = info.email || ""
  const loginHref = `/login?next=${encodeURIComponent(invitePath(token))}`

  if (isGuest && user) {
    return (
      <AuthShell title="Invitación">
        <h1 className="text-lg font-semibold">
          {inviter} te invita a planear «{tripName}»
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Crea tu cuenta con {inviteEmail} para unirte. Conservarás el viaje que ya tengas en este
          dispositivo.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            const invalid = validatePasswordPair(password, repeat)
            if (invalid) {
              setError(invalid)
              return
            }
            setBusy(true)
            const created = await completeInviteSignup(token, {
              password,
              displayName: name,
            })
            if (!created.ok) {
              setError(created.error)
              setBusy(false)
              return
            }
            try {
              await createClient().auth.refreshSession()
              await joinTrip()
            } catch {
              setError("No se pudo aceptar la invitación")
              setBusy(false)
            }
          }}
        >
          <div>
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Contraseña</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </div>
          <div>
            <Label>Repite la contraseña</Label>
            <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            Crear cuenta y unirme
          </Button>
        </form>
      </AuthShell>
    )
  }

  if (user && !isGuest) {
    const sessionEmail = (user.email || "").trim().toLowerCase()
    if (sessionEmail && inviteEmail && sessionEmail !== inviteEmail.toLowerCase()) {
      return (
        <AuthShell title="Invitación">
          <h1 className="text-lg font-semibold">Esta invitación es para otra cuenta</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Es para {inviteEmail} y has entrado como {user.email}.
          </p>
          <Button
            className="mt-4"
            onClick={async () => {
              await signOut()
              router.refresh()
            }}
          >
            Cambiar de cuenta
          </Button>
        </AuthShell>
      )
    }
    return (
      <AuthShell title="Invitación">
        <h1 className="text-lg font-semibold">
          {inviter} te invita a editar «{tripName}»
        </h1>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={async () => {
              setBusy(true)
              try {
                await joinTrip()
              } catch {
                setError("No se pudo aceptar")
                setBusy(false)
              }
            }}
            disabled={busy}
          >
            Aceptar
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/trips">Ahora no</Link>
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Invitación">
      <h1 className="text-lg font-semibold">
        {inviter} te ha invitado a planear «{tripName}»
      </h1>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          const invalid = validatePasswordPair(password, repeat)
          if (invalid) {
            setError(invalid)
            return
          }
          if (isTurnstileEnabled() && !captcha) {
            setError("Confirma que no eres un robot")
            return
          }
          setBusy(true)
          const created = await completeInviteSignup(token, {
            password,
            displayName: name,
          })
          if (!created.ok && !created.exists) {
            setError(created.error)
            setCaptcha(null)
            setCaptchaKey((k) => k + 1)
            setBusy(false)
            return
          }
          const login = await signIn(inviteEmail, password, captcha ?? undefined)
          if (!login.ok) {
            setError(login.error)
            setCaptcha(null)
            setCaptchaKey((k) => k + 1)
            setBusy(false)
            return
          }
          try {
            await joinTrip()
          } catch {
            setError("No se pudo aceptar la invitación")
            setBusy(false)
          }
        }}
      >
        <div>
          <Label>Email</Label>
          <Input value={inviteEmail} readOnly />
        </div>
        <div>
          <Label>Nombre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label>Contraseña</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div>
          <Label>Repite la contraseña</Label>
          <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        </div>
        {isTurnstileEnabled() ? (
          <Turnstile key={captchaKey} resetKey={captchaKey} onToken={setCaptcha} />
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          Crear cuenta y unirme
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href={loginHref} className="underline underline-offset-2">
            Entra
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
