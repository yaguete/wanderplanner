import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const PANEL_H = "h-[520px]"

const FRAME_GLOW =
  "radial-gradient(55% 50% at 50% 0%, #9F817340, transparent 72%)," +
  "radial-gradient(38% 45% at 12% 18%, hsl(199 89% 48% / 0.16), transparent 70%)," +
  "radial-gradient(36% 42% at 88% 14%, hsl(262 83% 58% / 0.14), transparent 70%)"

/** Cromo de ventana en negativo: el post del CTA y la landing co-branded lo comparten. */
export function PartnerBrowserFrame({
  url,
  children,
}: {
  url: string
  children: ReactNode
}) {
  return (
    <div
      aria-hidden
      className="relative isolate mx-auto mt-16 w-full max-w-6xl select-none px-4 sm:mt-20 sm:px-6"
    >
      <div
        className="pointer-events-none absolute inset-x-0 -top-1 -bottom-1 -z-10 rounded-[5rem] blur-xl"
        style={{ background: FRAME_GLOW }}
      />

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[hsl(20_8%_14%)] shadow-[0_1px_2px_rgb(0_0_0/0.35),0_28px_64px_-18px_rgb(0_0_0/0.55)]">
        <div className="pointer-events-none flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          </div>
          <div className="mx-auto flex h-6 w-full max-w-xs items-center justify-center overflow-hidden rounded-md bg-white/[0.06] px-3">
            <span className="truncate text-[11px] font-medium text-white/55">{url}</span>
          </div>
          <div className="w-10 shrink-0" />
        </div>

        <div className={cn("pointer-events-none overflow-hidden", PANEL_H)}>{children}</div>
      </div>
    </div>
  )
}
