"use client"

/**
 * Campos de perfil de viajero (tipos + referencias favoritas). Compartidos por el registro,
 * la modal del RegistrationGate y los ajustes de cuenta.
 */
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { TRAVELER_TYPES } from "@/lib/traveler-profile"
import type { FavoriteReferenceInput } from "@/lib/db/profile-repo"

export function TravelerProfileFields({
  travelerTypes,
  onTravelerTypesChange,
  references,
  onReferencesChange,
  compact = false,
}: {
  travelerTypes: string[]
  onTravelerTypesChange: (next: string[]) => void
  references: FavoriteReferenceInput[]
  onReferencesChange: (next: FavoriteReferenceInput[]) => void
  compact?: boolean
}) {
  const toggleType = (id: string) => {
    onTravelerTypesChange(
      travelerTypes.includes(id)
        ? travelerTypes.filter((t) => t !== id)
        : [...travelerTypes, id],
    )
  }

  const updateReference = (index: number, patch: Partial<FavoriteReferenceInput>) => {
    onReferencesChange(
      references.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    )
  }

  return (
    <div className={cn("flex flex-col", compact ? "gap-4" : "gap-6")}>
      <div className="flex flex-col gap-2">
        <Label>¿Qué tipo de viajero eres?</Label>
        <p className="text-xs text-muted-foreground">
          El asistente adapta sus recomendaciones a lo que elijas. Puedes marcar varios.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {TRAVELER_TYPES.map((type) => {
            const active = travelerTypes.includes(type.id)
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => toggleType(type.id)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground/80 hover:bg-muted",
                )}
              >
                {type.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Tus referencias de viajes</Label>
        <p className="text-xs text-muted-foreground">
          Blogueros, revistas o webs en las que confías. El asistente los priorizará al buscar,
          sin limitarse solo a ellos.
        </p>
        <div className="flex flex-col gap-2 pt-1">
          {references.map((ref, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={ref.label}
                onChange={(e) => updateReference(index, { label: e.target.value })}
                placeholder="La Cosmopolilla"
                className="flex-1"
                aria-label={`Nombre de la referencia ${index + 1}`}
              />
              <Input
                value={ref.url ?? ""}
                onChange={(e) => updateReference(index, { url: e.target.value })}
                placeholder="lacosmopolilla.com"
                className="flex-1"
                inputMode="url"
                aria-label={`Web de la referencia ${index + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                onClick={() => onReferencesChange(references.filter((_, i) => i !== index))}
                aria-label="Quitar referencia"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => onReferencesChange([...references, { label: "", url: "" }])}
          >
            <Plus className="h-4 w-4" />
            Añadir referencia
          </Button>
        </div>
      </div>
    </div>
  )
}
