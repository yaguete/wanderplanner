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

export function mcpOk<T extends Record<string, unknown>>(text: string, structuredContent: T) {
  return {
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
