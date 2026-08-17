import type { Metadata } from "next"
import { TripsShell } from "@/components/trips-shell"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function TripsLayout({ children }: { children: React.ReactNode }) {
  return <TripsShell>{children}</TripsShell>
}
