import { cn } from "@/lib/utils"

/**
 * Marrón de acento (velos, OG, favicon). Más claro que la tinta del lockup.
 * No usar como color de texto: 3.6:1 sobre blanco / 3.3:1 sobre canvas.
 */
export const BRAND_COLOR = "#9F8173"

/**
 * Tinta del lockup (isotipo + wordmark). Mismo tono que `BRAND_COLOR`
 * (H 17°, S 19%), 10 puntos más oscuro: 5.1:1 sobre blanco / 4.7:1 sobre canvas.
 * El wordmark es texto (necesita 4.5:1); la ardilla usa el mismo valor para
 * que el lockup se lea de un solo marrón.
 */
export const BRAND_INK = "#86675B"

const TAIL_PATH =
  "M55.2622 169.129C61.9837 156.55 84.9807 127.513 67.8016 100.615C45.2258 65.2671 2.59668 92.3981 2.59668 92.3981C2.59668 92.3981 3.84897 32.0586 45.2258 11.9326C86.6026 -8.19348 125.483 5.60461 146.8 37.0902C168.117 68.5757 161.847 101.873 131.753 134.578C101.658 167.283 86.6083 181.707 77.8332 199.318C69.058 216.928 68.4535 236.107 77.8332 249.633C82.1693 255.886 86.2482 260.39 91.3631 263.425C104.596 268.501 115.451 268.501 115.451 268.501C104.663 268.501 97.3124 266.956 91.3631 263.425C80.4767 259.25 67.9811 251.639 58.5967 237.767C37.805 207.033 48.5408 181.707 55.2622 169.129Z"

const BODY_PATH =
  "M115.451 268.501C95.3884 268.501 87.2128 263.158 77.8332 249.633C68.4535 236.107 69.058 216.928 77.8332 199.318C86.6083 181.707 101.658 167.283 131.753 134.578C161.847 101.873 168.117 68.5757 146.8 37.0902C125.483 5.60461 86.6026 -8.19348 45.2258 11.9326C3.84897 32.0586 2.59668 92.3981 2.59668 92.3981C2.59668 92.3981 45.2258 65.2671 67.8016 100.615C84.9807 127.513 61.9837 156.55 55.2622 169.129C48.5408 181.707 37.805 207.033 58.5967 237.767C79.3884 268.501 115.451 268.501 115.451 268.501ZM115.451 268.501C135.514 268.501 168.117 268.501 168.117 268.501C168.117 268.501 167.34 263.53 165.609 260.954C163.879 258.377 146.8 254.664 146.8 254.664C146.8 254.664 158.715 239.605 158.085 226.991C157.456 214.377 155.621 205.139 146.8 195.544C137.978 185.949 115.451 181.707 115.451 181.707C115.451 181.707 171.879 117.638 175.641 114.452C179.402 111.266 180.656 124.515 178.148 132.062C175.641 139.609 168.117 150.26 168.117 150.26C168.117 150.26 182.743 150.26 188.18 164.097C193.617 177.934 188.18 189.255 188.18 189.255C188.18 189.255 181.91 189.255 165.609 189.255C149.308 189.255 149.308 169.129 149.308 169.129"

export type BrandMarkVariant = "color" | "mono" | "negative"

function paintFor(variant: BrandMarkVariant): string {
  if (variant === "negative") return "#fff"
  if (variant === "mono") return "currentColor"
  return "hsl(var(--brand-ink))"
}

/** Ardilla de WanderPlanner. `color` sigue `--brand-ink` (marrón en claro, blanco en oscuro). */
export function BrandMark({
  className,
  variant = "color",
}: {
  className?: string
  variant?: BrandMarkVariant
}) {
  const paint = paintFor(variant)
  return (
    <svg
      viewBox="0 0 194 271"
      className={cn("h-9 w-auto shrink-0", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d={TAIL_PATH} fill={paint} />
      <path d={BODY_PATH} stroke={paint} strokeWidth={5} strokeLinecap="round" />
    </svg>
  )
}

/** Wordmark en `--brand-ink` (marrón en claro, blanco en oscuro) o blanco literal (`negative`). */
export function BrandWordmark({
  className,
  variant = "color",
  label,
  ink = "brand",
  hand,
}: {
  className?: string
  variant?: BrandMarkVariant
  /** Wordmark de una landing de blog; sin él, WanderPlanner (bold + light). */
  label?: string
  /** `black`: lockup de blog (no el marrón de WanderPlanner). */
  ink?: "brand" | "black"
  /** Letra manuscrita (Caveat / similar a Martie Regular). Sin faux-bold. */
  hand?: boolean
}) {
  return (
    <span
      className={cn(
        "truncate leading-none",
        hand
          ? "font-normal font-synthesis-none text-[1.375rem] tracking-normal"
          : "font-normal text-xl tracking-tight",
        variant === "negative"
          ? "text-white"
          : ink === "black"
            ? "text-black dark:text-foreground"
            : "text-[hsl(var(--brand-ink))]",
        className,
      )}
    >
      {label ? (
        <span className={hand ? "font-normal font-synthesis-none" : "font-bold"}>{label}</span>
      ) : (
        <>
          <span className="font-bold">Wander</span>
          <span className="font-light">Planner</span>
        </>
      )}
    </span>
  )
}

/** Ardilla + wordmark: el nombre apoya en la base del logo. */
export function BrandLockup({
  className,
  variant = "color",
  label,
  markSrc,
  wordmarkClassName,
  wordmarkInk,
  wordmarkHand,
}: {
  className?: string
  variant?: BrandMarkVariant
  label?: string
  /** SVG del blog partner; por defecto, la ardilla. El footer no lo pasa. */
  markSrc?: string
  wordmarkClassName?: string
  wordmarkInk?: "brand" | "black"
  wordmarkHand?: boolean
}) {
  return (
    <span className={cn("flex min-w-0 items-end gap-2", className)}>
      {/* `data-brand-mark`: el lockup volador de la landing colapsa este hueco al atracar.
          `square`: isotipo 1:1 (rosa de los vientos); sin él, la ardilla (194×271). */}
      <span
        className="inline-flex shrink-0 overflow-hidden"
        data-brand-mark={markSrc ? "square" : true}
      >
        {markSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- SVG del catálogo; el lockup volador escala el nodo.
          <img
            src={markSrc}
            alt=""
            width={36}
            height={36}
            aria-hidden
            className="h-9 w-9 shrink-0 object-contain"
          />
        ) : (
          <BrandMark variant={variant} />
        )}
      </span>
      <BrandWordmark
        className={cn("-mb-[0.12em]", wordmarkClassName)}
        variant={variant}
        label={label}
        ink={wordmarkInk}
        hand={wordmarkHand}
      />
    </span>
  )
}

/** SVG autocontenido para el snippet HTML de partners (WordPress puede filtrarlo). */
export function brandSvgMarkup(
  color: string,
  width = 16,
  height = 22,
): string {
  return (
    `<svg viewBox="0 0 194 271" width="${width}" height="${height}" fill="none" ` +
    `xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<path d="${TAIL_PATH}" fill="${color}"/>` +
    `<path d="${BODY_PATH}" stroke="${color}" stroke-width="5" stroke-linecap="round"/>` +
    `</svg>`
  )
}
