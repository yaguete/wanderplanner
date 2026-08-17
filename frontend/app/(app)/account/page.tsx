"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { TravelerProfileFields } from "@/components/auth/traveler-profile-fields"
import { useAuth } from "@/lib/auth-context"
import type { FavoriteReferenceInput } from "@/lib/db/profile-repo"

export default function AccountPage() {
  const router = useRouter()
  const { user, profile, favoriteReferences, isLoading, updateProfile } = useAuth()
  const goHome = () => router.push("/trips")

  const [name, setName] = useState("")
  const [travelerTypes, setTravelerTypes] = useState<string[]>([])
  const [travelerNotes, setTravelerNotes] = useState("")
  const [references, setReferences] = useState<FavoriteReferenceInput[]>([])
  const [saving, setSaving] = useState(false)

  // El perfil llega de forma asíncrona: se vuelca al formulario cuando aparece.
  useEffect(() => {
    setName(profile?.displayName ?? "")
    setTravelerTypes(profile?.travelerTypes ?? [])
    setTravelerNotes(profile?.travelerNotes ?? "")
  }, [profile])

  useEffect(() => {
    setReferences(favoriteReferences.map((r) => ({ label: r.label, url: r.url ?? "" })))
  }, [favoriteReferences])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const result = await updateProfile({
      displayName: name.trim() || null,
      travelerTypes,
      travelerNotes: travelerNotes.trim() || null,
      favoriteReferences: references,
    })
    setSaving(false)
    if (result.ok) {
      toast.success("Perfil actualizado")
      goHome()
    } else toast.error(result.error)
  }

  return (
    // Móvil: scrollea el documento (ver `trips-shell`), no este contenedor.
    <div className="flex-1 md:overflow-auto">
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-xl">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Tu perfil de viajero
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              El asistente usa esto para afinar sus recomendaciones y priorizar tus fuentes de
              confianza.
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center rounded-xl border border-dashed border-border px-6 py-14">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email ?? ""} disabled readOnly />
              </div>

              <TravelerProfileFields
                travelerTypes={travelerTypes}
                onTravelerTypesChange={setTravelerTypes}
                references={references}
                onReferencesChange={setReferences}
              />

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="traveler-notes">Algo más sobre cómo viajas</Label>
                <Textarea
                  id="traveler-notes"
                  value={travelerNotes}
                  onChange={(e) => setTravelerNotes(e.target.value)}
                  placeholder="Viajo con niños pequeños, prefiero alojamientos con cocina y evito madrugones."
                  rows={3}
                />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full sm:w-auto sm:px-4"
                  disabled={saving}
                  onClick={goHome}
                >
                  Cancelar y volver
                </Button>
                <Button type="submit" className="h-11 w-full sm:w-auto sm:px-6" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar cambios"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
