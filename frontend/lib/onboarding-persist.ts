/**
 * Marca de onboarding en `profiles.onboarding_seen_at`.
 *
 * `localStorage` sigue siendo el camino rápido (esta pestaña / este navegador).
 * El perfil es el que impide repetirlo en incógnito o en otro dispositivo:
 * una vez en la vida de la cuenta, salvo «Cómo funciona».
 *
 * Consulta propia, no va en `loadProfile`: si la columna aún no existe, el
 * perfil de viajero no debe romper. Ante error devolvemos `null` y el
 * auto-show no abre (el problema era mostrarlo de más).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

type OnboardingSeenRow = {
  onboarding_seen_at: string | null
}

/**
 * `true` = ya lo vio; `false` = el perfil confirma que no; `null` = no sabemos.
 */
export async function fetchOnboardingSeen(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("onboarding_seen_at")
      .eq("id", userId)
      .maybeSingle<OnboardingSeenRow>()

    if (error) return null
    if (!data) return false
    return Boolean(data.onboarding_seen_at)
  } catch {
    return null
  }
}

/** Deja constancia. No lanza: el navegador ya recuerda la decisión. No pisa un sello previo. */
export async function recordOnboardingSeen(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .update({ onboarding_seen_at: new Date().toISOString() })
      .eq("id", userId)
      .is("onboarding_seen_at", null)
  } catch {
    /* sin registro; localStorage ya cubre este navegador */
  }
}
