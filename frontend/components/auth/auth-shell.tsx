import Link from "next/link"
import { BrandLockup } from "@/components/brand-mark"
import { cn } from "@/lib/utils"

/** Marco común de /login, /signup, /forgot-password y /reset-password. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** `2xl` por si una cuenta necesita más ancho. */
  width?: "md" | "2xl"
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center bg-canvas px-5 py-10">
      {/* Mismo fondo que `/`: el embudo landing → signup no cambia de temperatura.
          El overflow va en las capas decorativas, no en <main>: Turnstile mete un
          iframe y `overflow-hidden` en el ancestro lo deja en un shell vacío. */}
      <div aria-hidden className="landing-grid-texture pointer-events-none absolute inset-0 -z-10 overflow-hidden" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden landing-brand-veil"
      />
      <Link href="/" className="outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring">
        <BrandLockup />
      </Link>

      <div
        className={cn(
          "mx-auto mt-10 w-full",
          width === "2xl" ? "max-w-2xl" : "max-w-md",
        )}
      >
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
        <div className="mt-7">{children}</div>
        {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </main>
  )
}
