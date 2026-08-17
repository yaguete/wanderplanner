import type { Metadata } from "next"
import { TripsShell } from "@/components/trips-shell"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/** Shell de `/trips` y `/account`: el grupo `(app)` no cambia las URLs. */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return <TripsShell>{children}</TripsShell>
}
