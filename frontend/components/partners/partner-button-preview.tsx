import { Fragment } from "react"
import { BrandMark } from "@/components/brand-mark"
import {
  PARTNER_BANNER_CHIP_KICKER,
  PARTNER_BANNER_DEFAULT_EMPHASIS,
  PARTNER_BANNER_DEFAULT_TEXT,
  PARTNER_BUTTON_ARIA_LABEL,
  PARTNER_BUTTON_KICKER,
  bannerAriaLabel,
  partnerBannerPreviewStyles,
  partnerButtonPreviewStyles,
  splitBannerCopy,
  type PartnerButtonVariant,
  type PartnerEmbedKind,
} from "@/lib/partner-button"

function Wordmark({ size }: { size: "cta" | "chip" }) {
  return (
    <span style={{ fontSize: size === "cta" ? "18px" : "16px", letterSpacing: "-0.02em" }}>
      <strong className="font-bold text-[inherit]">Wander</strong>
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
        <br />
        <Wordmark size="cta" />
      </span>
    </>
  )
}

function BannerInner({
  variant,
  text,
  emphasis,
}: {
  variant: PartnerButtonVariant
  text: string
  emphasis: string
}) {
  const styles = partnerBannerPreviewStyles(variant)
  return (
    <>
      <span style={styles.copy}>
        {splitBannerCopy(text, emphasis).map((runs, line) => (
          <Fragment key={line}>
            {line > 0 ? <br /> : null}
            {runs.map((run, i) =>
              run.strong ? (
                <strong key={i} className="font-bold text-[inherit]">
                  {run.text}
                </strong>
              ) : (
                <Fragment key={i}>{run.text}</Fragment>
              ),
            )}
          </Fragment>
        ))}
      </span>
      <span style={styles.chip}>
        <span style={{ display: "inline-flex", flexShrink: 0, lineHeight: 0 }}>
          <BrandMark variant="mono" className="h-[31px] w-auto" />
        </span>
        <span style={styles.chipCopy}>
          <span style={styles.chipKicker}>{PARTNER_BANNER_CHIP_KICKER}</span>
          <br />
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
  text = PARTNER_BANNER_DEFAULT_TEXT,
  emphasis = PARTNER_BANNER_DEFAULT_EMPHASIS,
}: {
  href?: string
  variant?: PartnerButtonVariant
  kind?: PartnerEmbedKind
  mode?: "link" | "mock"
  /** Solo banner: espejo de los mismos campos de `buildEmbedSnippet`. */
  text?: string
  emphasis?: string
}) {
  const isBanner = kind === "banner"
  const styles = isBanner
    ? partnerBannerPreviewStyles(variant)
    : partnerButtonPreviewStyles(variant)
  const className = variant === "color" ? "hover:!bg-white" : undefined
  const label = isBanner ? bannerAriaLabel(text) : PARTNER_BUTTON_ARIA_LABEL
  const inner = isBanner ? (
    <BannerInner variant={variant} text={text} emphasis={emphasis} />
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
