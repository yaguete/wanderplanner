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
  phone: "Ver tu teléfono",
  offline_access: "Mantener la conexión",
}

export function describeScope(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope
}

export function splitScopes(scope: string | null | undefined): string[] {
  return (scope ?? "").split(/\s+/).map((s) => s.trim()).filter(Boolean)
}
