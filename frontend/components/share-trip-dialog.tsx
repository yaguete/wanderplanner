"use client"

import { useMemo, useState } from "react"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { sendTripInvite } from "@/lib/trip-share-api"
import {
  TRIP_SHARE_CAP,
  canInviteToTrip,
  filterAvailablePeers,
  isLikelyEmail,
  normalizeEmail,
  occupancyOf,
} from "@/lib/trip-share"
import { useTripMembers } from "@/hooks/use-trip-members"
import { createClient } from "@/lib/supabase/client"

export function ShareTripDialog({
  tripId,
  isOwner,
  open,
  onOpenChange,
}: {
  tripId: string
  isOwner: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { isGuest, user } = useAuth()
  const { members, invites, peers, reload } = useTripMembers(open ? tripId : null, { isOwner })
  const [email, setEmail] = useState("")
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const occupancy = occupancyOf({ memberCount: members.length, pendingInviteCount: invites.length })
  const canInvite = canInviteToTrip({ isOwner, isGuest, occupancy })
  const presentIds = useMemo(() => new Set(members.map((m) => m.userId)), [members])
  const availablePeers = useMemo(
    () => filterAvailablePeers(peers, presentIds),
    [peers, presentIds],
  )

  const selectedPeer = availablePeers.find((p) => p.userId === selectedPeerId) ?? null

  const resetInviteForm = () => {
    setEmail("")
    setSelectedPeerId(null)
  }

  const submit = async () => {
    if (!canInvite) return
    setBusy(true)
    try {
      if (selectedPeer) {
        await sendTripInvite(tripId, { userId: selectedPeer.userId })
        toast.success(`Hemos añadido a ${selectedPeer.displayName} al viaje`)
      } else {
        const normalized = normalizeEmail(email)
        if (!isLikelyEmail(normalized)) {
          toast.error("Escribe un correo válido")
          return
        }
        if (user?.email && normalizeEmail(user.email) === normalized) {
          toast.error("Ese es tu correo")
          return
        }
        const result = await sendTripInvite(tripId, { email: normalized })
        if (result.emailSent === false) {
          toast.success(
            "La invitación está guardada, pero no hemos podido enviar el correo",
          )
        } else {
          toast.success("Invitación enviada")
        }
      }
      resetInviteForm()
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo compartir")
    } finally {
      setBusy(false)
    }
  }

  const removeMember = async (userId: string) => {
    const supabase = createClient()
    const { error } = await supabase.rpc("remove_trip_member", {
      p_trip_id: tripId,
      p_user_id: userId,
    })
    if (error) toast.error("No se pudo quitar a esa persona")
    else await reload()
  }

  const cancelInvite = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("trip_invites").delete().eq("id", id)
    if (error) toast.error("No se pudo cancelar")
    else await reload()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetInviteForm()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar a este viaje</DialogTitle>
          <DialogDescription>
            {isOwner
              ? "Podréis editar el plan a la vez. El asistente de cada uno sigue siendo privado."
              : "Solo el dueño del viaje puede invitar a más personas a editarlo. El asistente de cada uno siempre seguirá siendo privado."}
          </DialogDescription>
        </DialogHeader>

        {isOwner ? (
          <div className="space-y-3">
            <Input
              type="email"
              placeholder="correo@ejemplo.com"
              value={selectedPeer ? "" : email}
              onChange={(e) => {
                setSelectedPeerId(null)
                setEmail(e.target.value)
              }}
              disabled={!canInvite || busy || Boolean(selectedPeer)}
            />
            {availablePeers.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Personas con las que ya viajas</p>
                <ul className="space-y-1">
                  {availablePeers.map((p) => {
                    const selected = p.userId === selectedPeerId
                    return (
                      <li key={p.userId}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          disabled={!canInvite || busy}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                          onClick={() => {
                            setEmail("")
                            setSelectedPeerId(selected ? null : p.userId)
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {p.displayName}
                            <span className="ml-2 text-xs text-muted-foreground">{p.emailMasked}</span>
                          </span>
                          {selected ? (
                            <Check className="h-4 w-4 shrink-0 text-foreground" strokeWidth={2.5} aria-hidden />
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {selectedPeer
                ? `Añadiremos a ${selectedPeer.displayName} a este viaje.`
                : "Le enviaremos un correo con tu nombre y el del viaje."}
            </p>
            <Button
              type="button"
              className="w-full"
              disabled={!canInvite || busy || (!selectedPeer && !email.trim())}
              onClick={() => void submit()}
            >
              {selectedPeer ? "Añadir al viaje" : "Enviar invitación"}
            </Button>
            {occupancy >= TRIP_SHARE_CAP ? (
              <p className="text-xs text-destructive">Este viaje admite hasta 8 personas.</p>
            ) : null}
          </div>
        ) : null}

        <ul className="space-y-2 border-t border-border pt-3">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {m.displayName}
                {m.isOwner ? (
                  <span className="ml-2 text-xs text-muted-foreground">Dueño</span>
                ) : (
                  <span className="ml-2 text-xs text-muted-foreground">Puede editar</span>
                )}
              </span>
              {isOwner && !m.isOwner ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => void removeMember(m.userId)}>
                  Quitar
                </Button>
              ) : null}
            </li>
          ))}
          {isOwner
            ? invites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {inv.email}
                    <span className="ml-2 text-xs text-muted-foreground">Pendiente</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void cancelInvite(inv.id)}>
                    Cancelar
                  </Button>
                </li>
              ))
            : null}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
