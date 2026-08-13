import { ImageResponse } from "next/og"
import { BRAND_COLOR, brandSvgMarkup } from "@/components/brand-mark"

export const alt = "Los viajes que lees, convertidos en tu itinerario"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const MARK = `data:image/svg+xml;base64,${Buffer.from(
  brandSvgMarkup(BRAND_COLOR, 120, 168),
).toString("base64")}`

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F5F4F2",
          backgroundImage:
            "radial-gradient(ellipse 110% 70% at 50% 0%, rgba(39, 36, 33, 0.12), transparent 60%)",
        }}
      >
        <img src={MARK} width={120} height={168} alt="" />
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 52,
            fontWeight: 500,
            letterSpacing: -1.2,
            color: BRAND_COLOR,
          }}
        >
          WanderPlanner
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: 30,
            color: "#272421",
            opacity: 0.65,
          }}
        >
          Los viajes que lees, convertidos en tu itinerario
        </div>
      </div>
    ),
    { ...size },
  )
}
