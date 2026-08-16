"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export function AiTransferGate({
  ready,
  onAccept,
}: {
  ready: boolean
  onAccept: () => void
}) {
  return (
    <div className="px-3 py-3">
      <p className="text-sm font-medium tracking-tight">Antes de empezar</p>
      <p className="mt-1.5 text-pretty text-xs leading-5 text-foreground/70">
        Para responderte, el asistente envía los información de tu viaje a proveedores de IA fuera
        de la Unión Europea. No enviaremos tu nombre ni tu correo electrónico.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" className="h-8" disabled={!ready} onClick={onAccept}>
          De acuerdo
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2" asChild>
          <Link href="/legal/privacidad#terceros">Más información</Link>
        </Button>
      </div>
    </div>
  )
}
