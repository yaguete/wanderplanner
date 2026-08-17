import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Tu perfil",
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
