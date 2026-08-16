import { BrandMark } from "@/components/brand-mark"
import { partnerButtonPreviewStyles } from "@/lib/partner-button"

export const PARTNER_BUTTON_LABEL = "Planifica esta ruta con WanderPlanner"

function ButtonInner({ label }: { label: string }) {
  return (
    <>
      <span style={partnerButtonPreviewStyles.iconBox}>
        <BrandMark variant="negative" className="h-[22px]" />
      </span>
      <span>{label}</span>
    </>
  )
}

/** Vista previa del snippet: `<a>` real o silueta para mocks (`aria-hidden`). */
export function PartnerButtonPreview({
  href,
  label = PARTNER_BUTTON_LABEL,
  mode = "link",
}: {
  href?: string
  label?: string
  mode?: "link" | "mock"
}) {
  if (mode === "mock" || !href) {
    return (
      <span
        aria-hidden
        className="pointer-events-none select-none"
        style={partnerButtonPreviewStyles.anchor}
      >
        <ButtonInner label={label} />
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={partnerButtonPreviewStyles.anchor}
    >
      <ButtonInner label={label} />
    </a>
  )
}
