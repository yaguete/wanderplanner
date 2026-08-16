import { BrandMark } from "@/components/brand-mark"
import {
  PARTNER_BUTTON_ARIA_LABEL,
  PARTNER_BUTTON_KICKER,
  partnerButtonPreviewStyles,
  type PartnerButtonVariant,
} from "@/lib/partner-button"

function ButtonInner({ variant }: { variant: PartnerButtonVariant }) {
  const styles = partnerButtonPreviewStyles(variant)
  return (
    <>
      <span style={{ display: "inline-flex", flexShrink: 0, lineHeight: 0 }}>
        <BrandMark variant="mono" className="h-[39px] w-auto" />
      </span>
      <span style={styles.copy}>
        <span style={styles.kicker}>{PARTNER_BUTTON_KICKER}</span>
        <span style={styles.wordmark}>
          <span className="font-bold">Wander</span>
          <span className="font-light">Planner</span>
        </span>
      </span>
    </>
  )
}

/** Vista previa del snippet: `<a>` real o silueta para mocks (`aria-hidden`). */
export function PartnerButtonPreview({
  href,
  variant = "color",
  mode = "link",
}: {
  href?: string
  variant?: PartnerButtonVariant
  mode?: "link" | "mock"
}) {
  const styles = partnerButtonPreviewStyles(variant)

  const className = variant === "color" ? "hover:!bg-white" : undefined

  if (mode === "mock" || !href) {
    return (
      <span
        aria-hidden
        className={`pointer-events-none select-none ${className ?? ""}`.trim()}
        style={styles.anchor}
      >
        <ButtonInner variant={variant} />
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={PARTNER_BUTTON_ARIA_LABEL}
      className={className}
      style={styles.anchor}
    >
      <ButtonInner variant={variant} />
    </a>
  )
}
