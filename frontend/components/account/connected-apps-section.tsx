"use client"

import { useCallback, useEffect, useState } from "react"
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
import { Spinner } from "@/components/ui/spinner"
import { formatGrantDate, parseOAuthGrantList, type ConnectedGrant } from "@/lib/mcp/oauth-grants"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

export function ConnectedAppsSection() {
  const [grants, setGrants] = useState<ConnectedGrant[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<ConnectedGrant | null>(null)
  const [revoking, setRevoking] = useState(false)

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setGrants([])
      setLoadError(false)
      return
    }
    const supabase = createClient()
    const { data, error } = await supabase.auth.oauth.listGrants()
    if (error) {
      setLoadError(true)
      setGrants([])
      return
    }
    setLoadError(false)
    setGrants(parseOAuthGrantList(data))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleRevoke = async () => {
    if (!revokeTarget || revoking) return
    setRevoking(true)
    const supabase = createClient()
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId: revokeTarget.clientId })
    setRevoking(false)
    if (error) {
      toast.error("No se pudo revocar. Inténtalo de nuevo.")
      return
    }
    toast.success("Acceso revocado")
    setRevokeTarget(null)
    await reload()
  }

  return (
    <section>
      <h2 className="text-base font-medium text-foreground">Asistentes conectados</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Aplicaciones a las que has dado acceso a tus viajes. Revocar invalida sus sesiones
        y permisos de renovación al momento.
      </p>

      {grants === null ? (
        <div className="mt-4 flex justify-center rounded-xl border border-dashed border-border px-6 py-8">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : loadError ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No se pudieron cargar las aplicaciones conectadas. Recarga la página.
        </p>
      ) : grants.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Ningún asistente externo tiene acceso a tus viajes.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {grants.map((grant) => {
            const granted = formatGrantDate(grant.grantedAt)
            return (
              <li
                key={grant.clientId}
                className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{grant.clientName}</p>
                  {granted ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">Conectado el {granted}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full sm:w-auto sm:px-4"
                  onClick={() => setRevokeTarget(grant)}
                >
                  Revocar
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (revoking) return
          if (!open) setRevokeTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocar acceso</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget
                ? `${revokeTarget.clientName} dejará de poder leer tus viajes. Podrás volver a conectar más adelante.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              disabled={revoking}
              onClick={(e) => {
                e.preventDefault()
                void handleRevoke()
              }}
            >
              {revoking ? "Revocando…" : "Revocar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
