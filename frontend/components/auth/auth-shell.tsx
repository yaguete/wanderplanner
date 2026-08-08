import Link from "next/link"
import { BrandMark } from "@/components/app-header"
import { cn } from "@/lib/utils"

/** Marco común de /login, /signup y /partners. */
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
  /** `2xl` para páginas con más contenido (p. ej. /partners). */
  width?: "md" | "2xl"
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center px-5 py-10">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(110%_70%_at_50%_0%,hsl(221_83%_53%/0.12),transparent_60%)]"
      />
      <Link href="/" className="flex items-center gap-2.5">
        <BrandMark />
        <span className="text-sm font-semibold tracking-tight">WanderPlanner</span>
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
