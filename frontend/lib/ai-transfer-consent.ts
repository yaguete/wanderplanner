/**
 * Consentimiento art. 49.1.a para enviar el contexto del viaje a proveedores
 * de IA fuera de la UE (hoy incluye China, sin decisión de adecuación).
 *
 * Dos capas, a propósito:
 *  - `localStorage`, por usuario: gobierna la UI y responde al instante, sin
 *    esperar a la red ni parpadear el composer.
 *  - `profiles.ai_transfer_consent_at/_version`: la constancia que hay que poder
 *    enseñar (arts. 5.2 y 7.1 RGPD). Se escribe en diferido y sin bloquear.
 *
 * Si Supabase falla o la migración aún no está aplicada, manda el navegador: el
 * asistente nunca se queda inutilizable por no poder guardar el registro.
 *
 * El texto va por países, no por empresa, para que siga valiendo si rota el
 * proveedor. Si cambian los países del aviso hay que subir la versión: un
 * consentimiento informado solo cubre lo que el usuario llegó a leer.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

/** Fecha del texto de `ai-transfer-gate.tsx`. Súbela si cambia lo que se enseña. */
export const AI_TRANSFER_CONSENT_VERSION = "2026-08-16"

const KEY_PREFIX = "wp-ai-transfer-consent"

function storageKey(userId: string | null | undefined): string {
  const id = (userId ?? "").trim()
  return id ? `${KEY_PREFIX}:${id}` : KEY_PREFIX
}

/** Lectura síncrona para el primer render. Null = hay que preguntar (o consultar). */
export function hasAiTransferConsent(userId: string | null | undefined): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(storageKey(userId)) === AI_TRANSFER_CONSENT_VERSION
  } catch {
    return false
  }
}

export function rememberAiTransferConsent(userId: string | null | undefined): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey(userId), AI_TRANSFER_CONSENT_VERSION)
  } catch {
    /* almacenamiento bloqueado: vale para esta carga */
  }
}

export function forgetAiTransferConsent(userId: string | null | undefined): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(storageKey(userId))
  } catch {
    /* nada que hacer */
  }
}

type ConsentRow = {
  ai_transfer_consent_at: string | null
  ai_transfer_consent_version: string | null
}

/**
 * ¿Consta en el perfil, con la versión vigente? `false` también cuando la consulta
 * falla: ante la duda se vuelve a preguntar, que es el lado seguro.
 */
export async function fetchAiTransferConsent(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("ai_transfer_consent_at, ai_transfer_consent_version")
      .eq("id", userId)
      .maybeSingle<ConsentRow>()

    if (error || !data) return false
    return (
      Boolean(data.ai_transfer_consent_at) &&
      data.ai_transfer_consent_version === AI_TRANSFER_CONSENT_VERSION
    )
  } catch {
    return false
  }
}

/** Deja constancia. No lanza: la UI ya ha seguido adelante con el navegador. */
export async function recordAiTransferConsent(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .update({
        ai_transfer_consent_at: new Date().toISOString(),
        ai_transfer_consent_version: AI_TRANSFER_CONSENT_VERSION,
      })
      .eq("id", userId)
  } catch {
    /* sin registro; el navegador ya recuerda la decisión */
  }
}
