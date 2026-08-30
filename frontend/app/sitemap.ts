import type { MetadataRoute } from "next"
import { LEGAL } from "@/lib/legal"
import { SITE_URL } from "@/lib/site"

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = LEGAL.updatedAt
  return [
    { url: `${SITE_URL}/`, lastModified },
    { url: `${SITE_URL}/partners`, lastModified },
    { url: `${SITE_URL}/soporte`, lastModified },
    { url: `${SITE_URL}/legal/aviso-legal`, lastModified },
    { url: `${SITE_URL}/legal/privacidad`, lastModified },
    { url: `${SITE_URL}/legal/cookies`, lastModified },
  ]
}
