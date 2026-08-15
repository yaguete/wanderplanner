import { cn } from "@/lib/utils"

/** Fila de ítem del timeline: punto de color + texto. Solo decoración. */
export function LandingItemRow({
  dot,
  name,
  meta,
}: {
  dot: string
  name: string
  meta?: string
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot)} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-5 text-foreground">{name}</p>
        {meta ? <p className="truncate text-[11px] leading-4 text-muted-foreground">{meta}</p> : null}
      </div>
    </div>
  )
}

/** Pestaña de mockup: subrayado si está activa. */
export function MockTab({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex min-h-8 shrink-0 items-center pb-2 text-[11px]",
        active ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      {active ? (
        <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
      ) : null}
    </span>
  )
}

/** Miniatura OG inventada: bahía de Ha Long, sin raster. */
export function LandingOgThumb({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 56" className={cn("block", className)} aria-hidden>
      <rect width="80" height="56" fill="#c9dce6" />
      <rect y="34" width="80" height="22" fill="#6a9aaa" />
      <path d="M6 40 L22 12 L38 40Z" fill="#3f5c4c" />
      <path d="M28 42 L50 6 L72 42Z" fill="#334a3e" />
      <path d="M56 42 L68 20 L80 42Z" fill="#4a6756" />
    </svg>
  )
}

/** Foto de crónica inventada: terrazas de arroz, sin raster. */
export function LandingArticlePhoto({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 168"
      className={cn("block", className)}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width="320" height="168" fill="#d5e4ee" />
      <path d="M0 78 Q80 68 160 80 T320 76 L320 168 L0 168Z" fill="#8fbe6a" />
      <path d="M0 96 Q100 86 200 100 T320 94 L320 122 L0 122Z" fill="#7aa856" />
      <path d="M0 118 Q80 110 180 122 T320 116 L320 144 L0 144Z" fill="#658f44" />
      <path d="M0 140 Q120 132 220 144 T320 140 L320 168 L0 168Z" fill="#4e7334" />
      <path d="M36 78 L54 48 L72 78Z" fill="#5a7268" opacity="0.7" />
      <path d="M198 82 L228 40 L258 82Z" fill="#4d635a" opacity="0.65" />
    </svg>
  )
}

/** Casco viejo: distinta de las terrazas del marco del producto. */
export function LandingStreetPhoto({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 168"
      className={cn("block", className)}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width="320" height="168" fill="#efe6d4" />
      <circle cx="56" cy="96" r="28" fill="#7a9aa6" />
      <rect x="0" y="118" width="320" height="50" fill="#c4b49a" />
      <rect x="18" y="52" width="72" height="78" fill="#c47a4a" />
      <rect x="28" y="64" width="12" height="16" fill="#efe6d4" opacity="0.55" />
      <rect x="48" y="64" width="12" height="16" fill="#efe6d4" opacity="0.55" />
      <rect x="68" y="64" width="12" height="16" fill="#efe6d4" opacity="0.55" />
      <rect x="40" y="98" width="18" height="32" fill="#5c4030" />
      <rect x="108" y="38" width="86" height="92" fill="#d9a066" />
      <rect x="120" y="52" width="14" height="18" fill="#efe6d4" opacity="0.5" />
      <rect x="144" y="52" width="14" height="18" fill="#efe6d4" opacity="0.5" />
      <rect x="168" y="52" width="14" height="18" fill="#efe6d4" opacity="0.5" />
      <rect x="120" y="80" width="14" height="18" fill="#efe6d4" opacity="0.5" />
      <rect x="144" y="80" width="14" height="18" fill="#efe6d4" opacity="0.5" />
      <rect x="141" y="104" width="20" height="26" fill="#5c4030" />
      <rect x="214" y="58" width="64" height="72" fill="#b86a3c" />
      <rect x="226" y="70" width="12" height="16" fill="#efe6d4" opacity="0.5" />
      <rect x="250" y="70" width="12" height="16" fill="#efe6d4" opacity="0.5" />
      <rect x="236" y="100" width="18" height="30" fill="#5c4030" />
      <rect x="286" y="72" width="34" height="58" fill="#c47a4a" />
      <path d="M0 118 L320 118" stroke="#a89478" strokeWidth="2" />
    </svg>
  )
}
