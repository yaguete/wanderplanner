"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
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
  const { user, profile, favoriteReferences, isLoading, updateProfile } = useAuth()

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
    if (result.ok) toast.success("Perfil actualizado")
    else toast.error(result.error)
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href="/trips">
          <ArrowLeft className="h-4 w-4" />
          Volver a mis viajes
        </Link>
      </Button>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Tu perfil de viajero</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        El asistente usa esto para afinar sus recomendaciones y priorizar tus fuentes de confianza.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
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

        <Button type="submit" className="h-11 self-start px-6" disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>
    </main>
  )
}
