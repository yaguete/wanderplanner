import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Configuración",
}

export default function AccountSettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
