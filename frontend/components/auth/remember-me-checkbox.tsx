"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export function RememberMeCheckbox({
  id,
  checked,
  onCheckedChange,
  className,
}: {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
}) {
  return (
    <label className={cn("flex items-start gap-2.5 text-left text-sm leading-snug", className)}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <span>
        Recuérdame en este dispositivo
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Si lo desmarcas, cerraremos tu sesión al cerrar el navegador.
        </span>
      </span>
    </label>
  )
}
