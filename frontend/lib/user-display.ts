/** Nombre e iniciales a mostrar; los invitados no tienen email ni perfil relleno. */
import type { User } from "@supabase/supabase-js"
import type { TravelerProfile } from "@/lib/db/profile-repo"

export function displayNameFor(
  user: User | null,
  profile: TravelerProfile | null,
): string {
  if (profile?.displayName?.trim()) return profile.displayName.trim()
  const meta = user?.user_metadata
  const metaName = [meta?.display_name, meta?.full_name, meta?.name]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean)
  if (metaName) return metaName
  if (user?.is_anonymous) return "Invitado"
  const email = user?.email?.trim()
  if (email) return email.split("@")[0]
  return "Tu cuenta"
}

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase()
}
