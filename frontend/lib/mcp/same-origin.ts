/**
 * Defensa CSRF del consentimiento OAuth.
 *
 * `POST /oauth/decision` es lo que hace que GoTrue mine un código de autorización.
 * El `authorization_id` **no está ligado a ningún usuario hasta que alguien aprueba**:
 * se liga a la sesión de quien aprueba. Con el registro dinámico de clientes abierto,
 * cualquiera registra un cliente, arranca un `/authorize` y consigue un id válido; si
 * lograra que un POST cross-site saliera con la cookie de una víctima, el código se
 * mintaría contra la cuenta de la víctima.
 *
 * Hoy lo tapa `SameSite=Lax` (default de `@supabase/ssr`, que además al ir explícito
 * queda fuera de la ventana `Lax-allowing-unsafe` de Chrome). Pero eso es una invariante
 * del navegador que no está escrita en ninguna parte, y este repo **ya intercepta las
 * opciones de esas cookies** en `applyPersistMode`. No se apoya el único endpoint que
 * reparte acceso a las cuentas sobre un atributo que alguien puede tocar sin saberlo.
 */
import { SITE_URL } from "@/lib/site"

function originOf(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

/**
 * Origen público de la petición. En Vercel llega por `x-forwarded-host`; en local,
 * por la URL. Se usa para que el check valga también en los deploys de preview,
 * cuyo host no es `SITE_URL`.
 *
 * Que un atacante pudiera falsear estas cabeceras no rompe la defensa: lo que no
 * puede falsear desde el navegador de la víctima es el `Origin`, y es ese el que
 * tiene que coincidir.
 */
export function requestOrigin(req: {
  headers: Headers
  url: string
}): string | null {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  if (host) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https"
    return originOf(`${proto}://${host}`)
  }
  return originOf(req.url)
}

/**
 * `true` si el POST viene del propio sitio.
 *
 * Se acepta el origen del propio despliegue (producción o preview) y `SITE_URL`.
 * Se mira `Origin` y, si falta, `Referer`: los navegadores mandan `Origin` en todo
 * POST, incluido el same-origin. Sin ninguno de los dos se rechaza — un formulario
 * de navegador siempre trae uno, y lo que no lo trae no es el flujo que servimos.
 */
export function isSameOriginRequest(req: { headers: Headers; url: string }): boolean {
  const allowed = new Set(
    [requestOrigin(req), originOf(SITE_URL)].filter((v): v is string => Boolean(v)),
  )
  if (allowed.size === 0) return false

  const origin = originOf(req.headers.get("origin"))
  if (origin) return allowed.has(origin)

  const referer = originOf(req.headers.get("referer"))
  if (referer) return allowed.has(referer)

  return false
}
