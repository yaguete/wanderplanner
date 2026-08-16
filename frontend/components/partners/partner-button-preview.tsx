import { BrandMark } from "@/components/brand-mark"
import {
  PARTNER_BANNER_ARIA_LABEL,
  PARTNER_BANNER_CHIP_KICKER,
  PARTNER_BANNER_EMPHASIS,
  PARTNER_BANNER_LINE_1,
  PARTNER_BANNER_LINE_2_PREFIX,
  PARTNER_BUTTON_ARIA_LABEL,
  PARTNER_BUTTON_KICKER,
  partnerBannerPreviewStyles,
  partnerButtonPreviewStyles,
  type PartnerButtonVariant,
  type PartnerEmbedKind,
} from "@/lib/partner-button"

function Wordmark({ size }: { size: "cta" | "chip" }) {
  return (
    <span style={{ fontSize: size === "cta" ? "18px" : "16px", letterSpacing: "-0.02em" }}>
      <span className="font-bold">Wander</span>
      <span className="font-light">Planner</span>
    </span>
  )
}

function CtaInner({ variant }: { variant: PartnerButtonVariant }) {
  const styles = partnerButtonPreviewStyles(variant)
  return (
    <>
      <span style={{ display: "inline-flex", flexShrink: 0, lineHeight: 0 }}>
        <BrandMark variant="mono" className="h-[39px] w-auto" />
      </span>
      <span style={styles.copy}>
        <span style={styles.kicker}>{PARTNER_BUTTON_KICKER}</span>
        <Wordmark size="cta" />
      </span>
    </>
  )
}

function BannerInner({ variant }: { variant: PartnerButtonVariant }) {
  const styles = partnerBannerPreviewStyles(variant)
  return (
    <>
      <span style={styles.copy}>
        <span>{PARTNER_BANNER_LINE_1}</span>
        <span>
          {PARTNER_BANNER_LINE_2_PREFIX}
          <span className="font-bold">{PARTNER_BANNER_EMPHASIS}</span>?
        </span>
      </span>
      <span style={styles.chip}>
        <span style={{ display: "inline-flex", flexShrink: 0, lineHeight: 0 }}>
          <BrandMark variant="mono" className="h-[31px] w-auto" />
        </span>
        <span style={styles.chipCopy}>
          <span style={styles.chipKicker}>{PARTNER_BANNER_CHIP_KICKER}</span>
          <Wordmark size="chip" />
        </span>
      </span>
    </>
  )
}

/** Vista previa del snippet: `<a>` real o silueta para mocks (`aria-hidden`). */
export function PartnerButtonPreview({
  href,
  variant = "color",
  kind = "cta",
  mode = "link",
}: {
  href?: string
  variant?: PartnerButtonVariant
  kind?: PartnerEmbedKind
  mode?: "link" | "mock"
}) {
  const isBanner = kind === "banner"
  const styles = isBanner
    ? partnerBannerPreviewStyles(variant)
    : partnerButtonPreviewStyles(variant)
  const className = variant === "color" ? "hover:!bg-white" : undefined
  const label = isBanner ? PARTNER_BANNER_ARIA_LABEL : PARTNER_BUTTON_ARIA_LABEL
  const inner = isBanner ? (
    <BannerInner variant={variant} />
  ) : (
    <CtaInner variant={variant} />
  )

  if (mode === "mock" || !href) {
    return (
      <span
        aria-hidden
        className={`pointer-events-none select-none ${className ?? ""}`.trim()}
        style={styles.anchor}
      >
        {inner}
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={className}
      style={styles.anchor}
    >
      {inner}
    </a>
  )
}
