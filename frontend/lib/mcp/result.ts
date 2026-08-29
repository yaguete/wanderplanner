/** Respuestas MCP homogéneas: error de sesión, viaje inaccesible, lectura fallida. */

export const MCP_NO_SESSION = "No hay sesión. Vuelve a conectar WanderPlanner."

/** Mismo texto si el viaje no existe o RLS lo oculta: no enumeramos viajes ajenos. */
export const MCP_TRIP_UNAVAILABLE =
  "No encuentro ese viaje. Puede que no exista o que no tengas acceso."

export const MCP_READ_FAILED = "No se pudo leer el viaje. Inténtalo de nuevo."

export function mcpTextError(text: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text }],
  }
}

export function mcpOk<T extends object>(
  text: string,
  structuredContent: T,
  _meta?: Record<string, unknown>,
) {
  return _meta
    ? {
        content: [{ type: "text" as const, text }],
        structuredContent,
        _meta,
      }
    : {
        content: [{ type: "text" as const, text }],
        structuredContent,
      }
}

export function mcpUnavailableTrip() {
  return mcpTextError(MCP_TRIP_UNAVAILABLE)
}

export function mcpReadFailed() {
  return mcpTextError(MCP_READ_FAILED)
}

export function mcpNoSession() {
  return mcpTextError(MCP_NO_SESSION)
}

export function tokenFromCtx(ctx: { http?: { authInfo?: { token?: string } } }): string | null {
  const token = ctx.http?.authInfo?.token
  return typeof token === "string" && token.length > 0 ? token : null
}

export function userIdFromCtx(ctx: {
  http?: { authInfo?: { extra?: Record<string, unknown>; token?: string } }
}): string | null {
  const sub = ctx.http?.authInfo?.extra?.sub
  return typeof sub === "string" && sub.trim().length > 0 ? sub.trim() : null
}
