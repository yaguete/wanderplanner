type ResolveVendorLogoInput = {
  vendor?: string | null
  affiliateUrl?: string | null
}

export type VendorLogoResolution = {
  src: string | null
  source: "local" | "fallback" | "none"
}

const LOGO_PROVIDER = (process.env.NEXT_PUBLIC_VENDOR_LOGO_PROVIDER || "clearbit").trim().toLowerCase()

const HEYMODO_LOGO = "https://media.licdn.com/dms/image/v2/D4D0BAQEc7sifdY9aNg/company-logo_200_200/company-logo_200_200/0/1709629961932/heymondo_logo?e=2147483647&v=beta&t=AlKOi2tQwgBJ-tmaqWxS7nfa0nfx9EF2cH7q-MwWSU4"
const HOLAFLY_LOGO = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQJKCO652IjnJuoPZGKwfesHoPcvm1F_2XrSA&s"
const ROAD_TRIP_AFRICA_LOGO = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRMQ-hA7SI1-rvPcakuE_T86miIjBbf7TX7yA&s"
const IATI_LOGO = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSxZXkWPEaEXSHt2AT6mexyJ5n3oyLBux6lUA&s"
const CHAPKA_LOGO = "https://www.chapkadirect.es/logos/metas/preview_1192_fr.png"
const INTERMUNDIAL_LOGO = "https://www.hoteltecnia.es/wp-content/uploads/2022/03/11.png"
const AUTO_EUROPE_LOGO =
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR4yOu4uNfTQAC3eN5UmMKFTyPAr5pE02yw4w&s"
const GETYOURGUIDE_LOGO =
  "https://images.unidays.world/i/customers/mobile/active/a183f06d-aacb-4769-940c-176d30703597?w=256&format=webp"
const FRANSCHHOEK_WINE_TRAM_LOGO = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ0Mn-WOxOkaahGOUNlI4iDDen2wJd6yoouPw&s"
const N26_LOGO = "https://images.ctfassets.net/q33z48p65a6w/7tWPNVL62k6IQOMKm0SaU2/98523f3edb89a886fbbabaaa24c127bc/N26_Logo_Black_RGB_M.jpg?fl=progressive&fm=jpg&q=80&w=320"
const REVOLUT_LOGO = "https://brandlogos.net/wp-content/uploads/2022/07/revolut-logo_brandlogos.net_sd4zp.png"
const CIVITATIS_LOGO = "https://upload.wikimedia.org/wikipedia/commons/b/b0/Logo_de_Civitatis.png"
const BOOKING_LOGO = "https://play-lh.googleusercontent.com/eJuvWSnbPwEWAQCYwl8i9nPJXRzTv94JSYGGrKIu0qeuG_5wgYtb982-2F_jOGtIytY"
const SKYSCANNER_LOGO = "https://www.skyscanner.es/images/opengraph_v1.png"
const OMIO_LOGO = "https://www.omio.fr/corporate/wp-content/uploads/sites/2/resized/2022/05/media-3-270x180-c-default.jpg"
const MOTORHOME_REPUBLIC_LOGO = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTJla2gWB9W3qGgJF5GPFMDo9ijA_9g7z59IQ&s"

/** Claves en minúsculas (mismo criterio que `normalizeWording`). */
const KNOWN_VENDOR_LOGOS: Record<string, string> = {
  heymondo: HEYMODO_LOGO,
  holafly: HOLAFLY_LOGO,
  "road trip africa": ROAD_TRIP_AFRICA_LOGO,
  iati: IATI_LOGO,
  intermundial: INTERMUNDIAL_LOGO,
  "auto europe": AUTO_EUROPE_LOGO,
  autoeurope: AUTO_EUROPE_LOGO,
  "get your guide": GETYOURGUIDE_LOGO,
  getyourguide: GETYOURGUIDE_LOGO,
  "franschhoek wine tram": FRANSCHHOEK_WINE_TRAM_LOGO,
  franschhoekwinetram: FRANSCHHOEK_WINE_TRAM_LOGO,
  chapka: CHAPKA_LOGO,
  n26: N26_LOGO,
  revolut: REVOLUT_LOGO,
  civitatis: CIVITATIS_LOGO,
  booking: BOOKING_LOGO,
  skyscanner: SKYSCANNER_LOGO,
  omio: OMIO_LOGO,
  "motorhome republic": MOTORHOME_REPUBLIC_LOGO,
}

const KNOWN_DOMAIN_LOGOS: Record<string, string> = {
  "heymondo.es": HEYMODO_LOGO,
  "heymondo.com": HEYMODO_LOGO,
  "holafly.com": HOLAFLY_LOGO,
  "roadtripafrica.com": ROAD_TRIP_AFRICA_LOGO,
  "iati.org": IATI_LOGO,
  "winetram.co.za": FRANSCHHOEK_WINE_TRAM_LOGO,
}

function normalizeWording(v: string | null | undefined): string {
  if (!v) return ""
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function hostnameFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  try {
    const u = new URL(url)
    return u.hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

function clearbitLogoUrl(hostname: string): string {
  return `https://logo.clearbit.com/${hostname}`
}

function logoFromHost(host: string): string | null {
  const exact = KNOWN_DOMAIN_LOGOS[host]
  if (exact) return exact
  if (host.includes("getyourguide")) return GETYOURGUIDE_LOGO
  if (host.startsWith("auto-europe.") || host === "auteurope.com") return AUTO_EUROPE_LOGO
  if (host.includes("winetram") || host.includes("franschhoekwinetram")) return FRANSCHHOEK_WINE_TRAM_LOGO
  return null
}

export function resolveVendorLogo({ vendor, affiliateUrl }: ResolveVendorLogoInput): VendorLogoResolution {
  const v = normalizeWording(vendor)
  const vCompact = v.replace(/\s+/g, "")
  const host = hostnameFromUrl(affiliateUrl)

  if (v && KNOWN_VENDOR_LOGOS[v]) {
    return { src: KNOWN_VENDOR_LOGOS[v], source: "local" }
  }
  if (vCompact && KNOWN_VENDOR_LOGOS[vCompact]) {
    return { src: KNOWN_VENDOR_LOGOS[vCompact], source: "local" }
  }

  if (host) {
    const byHost = logoFromHost(host)
    if (byHost) return { src: byHost, source: "local" }
  }

  if (!host) {
    return { src: null, source: "none" }
  }

  if (LOGO_PROVIDER === "none") {
    return { src: null, source: "none" }
  }

  return { src: clearbitLogoUrl(host), source: "fallback" }
}
