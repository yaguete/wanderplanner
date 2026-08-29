import { jwtVerify, createRemoteJWKSet, type JWTPayload, type JWTVerifyGetKey } from "jose"
import { AUTHENTICATED_AUD, supabaseIssuer, supabaseJwksUrl } from "./config"

export type McpAuthInfo = {
  token: string
  clientId: string
  scopes: string[]
  expiresAt?: number
  extra?: Record<string, unknown>
}

export type VerifyAccessTokenInput = {
  token: string
  issuer: string
  audience?: string
  /** Secreto HS256 (legado). Si está, no se usa JWKS. */
  secret?: string
  /** Clave JWKS / local. Obligatorio si no hay `secret`. */
  getKey?: JWTVerifyGetKey
}

function audValues(aud: JWTPayload["aud"]): string[] {
  if (typeof aud === "string") return [aud]
  if (Array.isArray(aud)) return aud.filter((v): v is string => typeof v === "string")
  return []
}

function clientIdOf(payload: JWTPayload): string {
  const raw = payload.client_id
  return typeof raw === "string" ? raw.trim() : ""
}

function scopesOf(payload: JWTPayload): string[] {
  const raw = payload.scope ?? payload.scp
  if (typeof raw === "string") {
    return raw.split(/\s+/).map((s) => s.trim()).filter(Boolean)
  }
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
  }
  return []
}

/**
 * Verifica un access token de Supabase para el MCP.
 * Firma (HS256 o JWKS) + iss + exp + aud === "authenticated" + `client_id` (el enlace).
 * Nunca acepta claims sin firma ni invitados anónimos.
 */
export async function verifyAccessToken(
  input: VerifyAccessTokenInput,
): Promise<McpAuthInfo | undefined> {
  const token = input.token.trim()
  if (!token || !input.issuer) return undefined

  const audience = input.audience ?? AUTHENTICATED_AUD
  const key = input.secret
    ? new TextEncoder().encode(input.secret)
    : input.getKey
  if (!key) return undefined

  let payload: JWTPayload
  try {
    const verified = await jwtVerify(token, key, {
      issuer: input.issuer,
      audience,
      algorithms: input.secret ? ["HS256"] : ["ES256", "RS256"],
    })
    payload = verified.payload
  } catch {
    return undefined
  }

  const aud = audValues(payload.aud)
  if (!aud.includes(audience)) return undefined

  const clientId = clientIdOf(payload)
  if (!clientId) return undefined

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : ""
  if (!sub) return undefined

  if (payload.is_anonymous === true) return undefined

  if (typeof payload.exp !== "number") return undefined

  return {
    token,
    clientId,
    scopes: scopesOf(payload),
    expiresAt: payload.exp,
    extra: {
      sub,
      ...(payload.aud !== undefined ? { aud: payload.aud } : {}),
    },
  }
}

const jwksByUrl = new Map<string, JWTVerifyGetKey>()

function remoteJwks(url: string): JWTVerifyGetKey {
  let cached = jwksByUrl.get(url)
  if (!cached) {
    cached = createRemoteJWKSet(new URL(url))
    jwksByUrl.set(url, cached)
  }
  return cached
}

/** `verifyToken` de `withMcpAuth`. Lee env en cada petición. */
export async function verifyMcpBearer(
  _req: Request,
  bearerToken?: string,
): Promise<McpAuthInfo | undefined> {
  if (!bearerToken) return undefined

  const issuer = supabaseIssuer()
  // OJO: **no** se lee `SUPABASE_JWT_SECRET`. La integración de Supabase↔Vercel inyecta
  // esa variable sola en el proyecto, y el proyecto firma con **ES256** (JWKS): si la
  // tomáramos, iríamos por HS256 y rechazaríamos *todos* los tokens con un 401 que
  // parece un fallo del verificador. HS256 es solo para local (`supabase start`), y se
  // pide con un nombre que ninguna integración va a poner por su cuenta.
  const secret = (process.env.MCP_JWT_HS256_SECRET ?? "").trim()
  const jwksUrl = supabaseJwksUrl()

  let info: McpAuthInfo | undefined
  try {
    info = await verifyAccessToken({
      token: bearerToken,
      issuer,
      secret: secret || undefined,
      getKey: secret ? undefined : jwksUrl ? remoteJwks(jwksUrl) : undefined,
    })
  } catch (error) {
    console.error("[mcp] error inesperado al verificar el token", error)
    return undefined
  }

  if (!info) {
    console.warn("[mcp] token rechazado")
    return undefined
  }

  console.info("[mcp] token ok", {
    client_id: info.clientId,
    sub: info.extra?.sub,
    aud: info.extra?.aud,
  })
  return info
}
