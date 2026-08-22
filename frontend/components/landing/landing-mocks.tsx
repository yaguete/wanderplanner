import { cn } from "@/lib/utils"

/** Fila de ítem del timeline: punto de color + texto. Solo decoración. */
export function LandingItemRow({
  dot,
  name,
  meta,
  tone = "light",
}: {
  dot: string
  name: string
  meta?: string
  tone?: "light" | "negative"
}) {
  const negative = tone === "negative"
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2",
        negative ? "border-white/10 bg-white/[0.04]" : "border-border bg-background",
      )}
    >
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot)} />
      <div className="min-w-0">
        <p
          className={cn(
            "truncate text-[13px] font-medium leading-5",
            negative ? "text-white" : "text-foreground",
          )}
        >
          {name}
        </p>
        {meta ? (
          <p
            className={cn(
              "truncate text-[11px] leading-4",
              negative ? "text-white/60" : "text-muted-foreground",
            )}
          >
            {meta}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** Pestaña de mockup: subrayado si está activa. */
export function MockTab({
  label,
  active,
  tone = "light",
}: {
  label: string
  active?: boolean
  tone?: "light" | "negative"
}) {
  const negative = tone === "negative"
  return (
    <span
      className={cn(
        "relative inline-flex min-h-8 shrink-0 items-center pb-2 text-[11px]",
        active
          ? negative
            ? "font-semibold text-white"
            : "font-semibold text-foreground"
          : negative
            ? "font-medium text-white/50"
            : "font-medium text-muted-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      {active ? (
        <span
          className={cn(
            "absolute inset-x-0 bottom-0 h-0.5 rounded-full",
            negative ? "bg-white" : "bg-primary",
          )}
        />
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

/** Miniatura OG: Catedral de Granada, sin raster. Distinta de la Alhambra de la crónica. */
export function LandingAlhambraThumb({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 56" className={cn("block", className)} aria-hidden>
      <rect width="80" height="56" fill="#cfdce8" />
      <rect y="44" width="80" height="12" fill="#c4b49a" />
      <path d="M10 44 L40 10 L70 44Z" fill="#d9c4a0" />
      <rect x="16" y="28" width="48" height="16" fill="#cbb089" />
      <circle cx="40" cy="24" r="6" fill="#8a9aab" />
      <circle cx="40" cy="24" r="3" fill="#cfdce8" />
      <rect x="34" y="36" width="12" height="8" fill="#6b4a38" />
      <path d="M34 36 Q40 30 46 36Z" fill="#6b4a38" />
      <rect x="58" y="8" width="14" height="36" fill="#b8956a" />
      <rect x="61" y="12" width="3.5" height="6" fill="#cfdce8" opacity="0.55" />
      <rect x="66.5" y="12" width="3.5" height="6" fill="#cfdce8" opacity="0.55" />
      <rect x="61" y="22" width="3.5" height="6" fill="#cfdce8" opacity="0.55" />
      <rect x="66.5" y="22" width="3.5" height="6" fill="#cfdce8" opacity="0.55" />
      <rect x="20" y="32" width="5" height="6" fill="#efe6d4" opacity="0.55" />
      <rect x="55" y="32" width="5" height="6" fill="#efe6d4" opacity="0.55" />
    </svg>
  )
}

/** Foto de crónica inventada: atardecer en la Sabika, sin raster. */
export function LandingAlhambraPhoto({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 168"
      className={cn("block", className)}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width="320" height="168" fill="#f0c9a0" />
      <rect y="72" width="320" height="96" fill="#d4a574" />
      <path d="M0 88 L320 70 L320 168 L0 168Z" fill="#c49262" />
      <rect x="78" y="54" width="164" height="52" fill="#c45c3e" />
      <rect x="68" y="42" width="22" height="64" fill="#a3442c" />
      <rect x="230" y="36" width="26" height="70" fill="#a3442c" />
      <rect x="148" y="40" width="24" height="28" fill="#8b3424" />
      <rect x="96" y="68" width="14" height="18" fill="#f0c9a0" opacity="0.4" />
      <rect x="122" y="68" width="14" height="18" fill="#f0c9a0" opacity="0.4" />
      <rect x="184" y="68" width="14" height="18" fill="#f0c9a0" opacity="0.4" />
      <rect x="210" y="68" width="14" height="18" fill="#f0c9a0" opacity="0.4" />
      <path d="M28 96 L36 58 L44 96Z" fill="#2f4a3c" />
      <path d="M48 98 L54 64 L60 98Z" fill="#2f4a3c" />
      <path d="M272 92 L280 52 L288 92Z" fill="#2f4a3c" />
      <path d="M292 94 L298 62 L304 94Z" fill="#2f4a3c" />
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
