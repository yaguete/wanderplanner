"use client"

import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Burbuja bajo el cromo sticky en móvil: overlay (`absolute` + cristal).
 * El contenido arranca con `--wp-chrome-reveal-clearance` para no nacer
 * debajo del círculo; al hacer scroll pasa por detrás, como el dock.
 */
export function CollapsedChromeReveal({
  show,
  onReveal,
}: {
  show: boolean
  onReveal: () => void
}) {
  if (!show) return null
  return (
    <button
      type="button"
      onClick={onReveal}
      aria-label="Mostrar cabecera"
      className={cn(
        "absolute left-1/2 top-full z-10 mt-2 flex size-8 -translate-x-1/2 items-center justify-center",
        "wp-glass rounded-full touch-manipulation text-foreground md:hidden",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <ChevronDown className="h-4 w-4" strokeWidth={2.25} aria-hidden />
    </button>
  )
}
