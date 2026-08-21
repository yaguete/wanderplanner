"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Turnstile, isTurnstileEnabled } from "@/components/auth/turnstile"
import { useAuth } from "@/lib/auth-context"
import { hasPasswordIdentity } from "@/lib/auth-google"
import {
  confirmationNameFor,
  matchesAccountConfirmation,
  validatePasswordChange,
} from "@/lib/account-security"
import { cn } from "@/lib/utils"

export default function AccountSettingsPage() {
  const router = useRouter()
  const { user, profile, isLoading, isGuest, updatePassword, deleteAccount } = useAuth()

  const [currentPassword, setCurrentPassword] = useState("")
  const [nextPassword, setNextPassword] = useState("")
  const [repeatPassword, setRepeatPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)

  const [showDelete, setShowDelete] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTyped, setDeleteTyped] = useState("")
  const [deleting, setDeleting] = useState(false)

  const captchaEnabled = isTurnstileEnabled()
  const confirmationName = confirmationNameFor(user, profile)
  const deleteMatches = matchesAccountConfirmation(deleteTyped, confirmationName)
  const canChangePassword = hasPasswordIdentity(user)

  useEffect(() => {
    if (!isLoading && isGuest) router.replace("/trips")
  }, [isLoading, isGuest, router])

  const resetCaptcha = () => {
    setCaptchaToken(null)
    setCaptchaKey((key) => key + 1)
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validation = validatePasswordChange({
      current: currentPassword,
      next: nextPassword,
      repeat: repeatPassword,
      requiresCurrent: true,
    })
    if (validation) {
      toast.error(validation)
      return
    }
    if (captchaEnabled && !captchaToken) {
      toast.error("Confirma que no eres un robot.")
      return
    }
    setSavingPassword(true)
    const result = await updatePassword({
      current: currentPassword,
      next: nextPassword,
      captchaToken: captchaToken ?? undefined,
    })
    setSavingPassword(false)
    if (!result.ok) {
      resetCaptcha()
      toast.error(result.error)
      return
    }
    setCurrentPassword("")
    setNextPassword("")
    setRepeatPassword("")
    if (captchaEnabled) resetCaptcha()
    toast.success("Contraseña actualizada")
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (!deleteMatches || deleting) return
    setDeleting(true)
    const result = await deleteAccount()
    if (!result.ok) {
      setDeleting(false)
      toast.error(result.error)
      return
    }
    // Hard nav: desmonta el TripProvider (y el TripsSyncer) antes de un
    // flush de pagehide con un JWT cuyo usuario ya no existe.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ver comentario
    window.location.assign("/")
  }

  const waitingGuestRedirect = !isLoading && isGuest
  const busy = isLoading || waitingGuestRedirect

  return (
    <div className="flex-1 md:overflow-auto">
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-xl">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Configuración de cuenta
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Email, contraseña y el cierre de la cuenta. El perfil de viajero está en Perfil.
            </p>
          </div>

          {busy ? (
            <div className="flex justify-center rounded-xl border border-dashed border-border px-6 py-14">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col gap-10">
              <section className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email ?? ""} disabled readOnly />
                {user?.new_email ? (
                  <p className="text-sm text-muted-foreground">
                    Cambio pendiente de confirmar: {user.new_email}
                  </p>
                ) : null}
              </section>

              <section>
                <h2 className="text-base font-medium text-foreground">Contraseña</h2>
                {canChangePassword ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Para cambiarla, confirma la actual y escribe la nueva dos veces.
                    </p>
                    <form onSubmit={handlePasswordSubmit} className="mt-4 flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="current-password">Contraseña actual</Label>
                        <Input
                          id="current-password"
                          type="password"
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                        />
                        <Link
                          href="/forgot-password"
                          className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          ¿No la recuerdas?
                        </Link>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="new-password">Nueva contraseña</Label>
                        <Input
                          id="new-password"
                          type="password"
                          autoComplete="new-password"
                          minLength={6}
                          value={nextPassword}
                          onChange={(e) => setNextPassword(e.target.value)}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="repeat-password">Repetir nueva contraseña</Label>
                        <Input
                          id="repeat-password"
                          type="password"
                          autoComplete="new-password"
                          minLength={6}
                          value={repeatPassword}
                          onChange={(e) => setRepeatPassword(e.target.value)}
                        />
                      </div>

                      {captchaEnabled ? (
                        <Turnstile
                          key={captchaKey}
                          resetKey={captchaKey}
                          appearance="interaction-only"
                          onToken={setCaptchaToken}
                        />
                      ) : null}

                      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 w-full sm:w-auto sm:px-4"
                          disabled={savingPassword}
                          onClick={() => router.push("/trips")}
                        >
                          Cancelar y volver
                        </Button>
                        <Button
                          type="submit"
                          className="h-11 w-full sm:w-auto sm:px-6"
                          disabled={savingPassword || (captchaEnabled && !captchaToken)}
                        >
                          {savingPassword ? "Guardando…" : "Cambiar contraseña"}
                        </Button>
                      </div>
                    </form>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Entras con Google. Si quieres poder entrar también con contraseña,{" "}
                    <Link
                      href="/forgot-password"
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      créate una
                    </Link>
                    .
                  </p>
                )}
              </section>

              <section>
                <button
                  type="button"
                  className="inline-flex h-11 w-full items-center justify-center gap-1 text-sm font-medium text-destructive hover:text-destructive/90 sm:h-auto sm:w-auto sm:justify-start"
                  aria-expanded={showDelete}
                  onClick={() => setShowDelete((open) => !open)}
                >
                  Borrar cuenta
                  <ChevronDown
                    className={cn("size-3.5 transition-transform", showDelete && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {showDelete ? (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground">
                      Se van contigo los datos de tu perfil, tus viajes, las fuentes que añadiste y todas tus
                      conversaciones con el asistente. Esta acción no se puede deshacer.
                    </p>
                    <Button
                      type="button"
                      variant="destructive"
                      className="mt-4 h-11 w-full sm:w-auto sm:px-6"
                      onClick={() => {
                        setDeleteTyped("")
                        setDeleteOpen(true)
                      }}
                    >
                      Borrar cuenta
                    </Button>
                  </div>
                ) : null}
              </section>
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (deleting) return
          setDeleteOpen(open)
          if (!open) setDeleteTyped("")
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Borrar cuenta</AlertDialogTitle>
            <AlertDialogDescription>
              Se irán tu perfil, tus viajes, las fuentes que añadiste y las conversaciones
              del asistente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="delete-confirm">
              Escribe <span className="font-medium text-foreground">{confirmationName}</span>{" "}
              para confirmar
            </Label>
            <Input
              id="delete-confirm"
              autoComplete="off"
              value={deleteTyped}
              onChange={(e) => setDeleteTyped(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              disabled={!deleteMatches || deleting}
              onClick={(e) => void handleDelete(e)}
            >
              {deleting ? "Borrando…" : "Borrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
