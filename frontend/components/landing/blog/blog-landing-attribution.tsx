"use client"

import { useEffect } from "react"
import {
  attributionForBlogLanding,
  readFunnelAttribution,
  rememberFunnelAttribution,
} from "@/lib/funnel-analytics"

/** Isla: escribe `wp-funnel-attr` al abrir la landing del blog. */
export function BlogLandingAttribution({ refSlug }: { refSlug: string }) {
  useEffect(() => {
    rememberFunnelAttribution(
      attributionForBlogLanding(refSlug, readFunnelAttribution()),
    )
  }, [refSlug])
  return null
}
