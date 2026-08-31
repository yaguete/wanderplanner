"use client"

/**
 * Campo de contraseña con el ojito para mostrar/ocultar lo escrito.
 * Un solo sitio: login, alta, recuperación, invitaciones y ajustes.
 */
import { useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function PasswordInput({
  className,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false)
  const label = visible ? "Ocultar contraseña" : "Mostrar contraseña"

  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={visible ? "text" : "password"}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        aria-label={label}
        aria-pressed={visible}
        title={label}
        disabled={disabled}
        className="absolute right-0 top-0 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        onClick={() => setVisible((open) => !open)}
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  )
}
