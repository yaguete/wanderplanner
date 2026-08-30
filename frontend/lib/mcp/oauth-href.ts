/**
 * Destino de vuelta al consentimiento. El `next` de login/alta lleva query
 * (`?authorization_id=`), así que hay que meterlo entero en un único param.
 */
export function consentPath(authorizationId: string): string {
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
}

export function loginWithConsent(authorizationId: string): string {
  return `/login?next=${encodeURIComponent(consentPath(authorizationId))}`
}

export function signupWithConsent(authorizationId: string): string {
  return `/signup?next=${encodeURIComponent(consentPath(authorizationId))}`
}

const SCOPE_LABELS: Record<string, string> = {
  openid: "Identificarte en WanderPlanner",
  email: "Ver tu correo",
  profile: "Ver tu nombre y foto de perfil",
  offline_access: "Mantener la conexión",
}

/**
 * Scopes que el cliente pide pero de los que **no tenemos ningún dato**, así que
 * no se entrega nada y no se enumeran: la lista de la pantalla dice qué recibe
 * el asistente, y anunciar «ver tu teléfono» prometería un dato que no existe.
 *
 * `approveAuthorization` **no admite acotar scopes** (solo `skipBrowserRedirect`),
 * así que Supabase concede lo que se pidió; esto es presentación, no permiso.
 *
 * ⚠️ Si algún día WanderPlanner guarda teléfono —login por SMS, 2FA— hay que
 * sacarlo de aquí y devolverlo a `SCOPE_LABELS`, o estaríamos ocultando un dato
 * que sí se entrega.
 */
const SCOPES_WITHOUT_DATA = new Set(["phone"])

export function describeScope(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope
}

/** Un scope desconocido se enumera igual: se falla del lado de enseñarlo. */
export function isShownScope(scope: string): boolean {
  return !SCOPES_WITHOUT_DATA.has(scope)
}

export function splitScopes(scope: string | null | undefined): string[] {
  return (scope ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(isShownScope)
}
