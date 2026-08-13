import { ImageResponse } from "next/og"
import { BRAND_COLOR, brandSvgMarkup } from "@/components/brand-mark"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

const MARK = `data:image/svg+xml;base64,${Buffer.from(
  brandSvgMarkup(BRAND_COLOR, 90, 126),
).toString("base64")}`

/** Fondo opaco: iOS pinta la transparencia del apple-touch-icon en negro. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
        }}
      >
        <img src={MARK} width={90} height={126} alt="" />
      </div>
    ),
    { ...size },
  )
}
