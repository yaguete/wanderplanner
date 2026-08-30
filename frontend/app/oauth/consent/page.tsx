import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AuthShell } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import {
  describeScope,
  loginWithConsent,
  signupWithConsent,
  splitScopes,
} from "@/lib/mcp/oauth-href"

export const metadata: Metadata = {
  title: "Autorizar acceso",
  robots: { index: false, follow: false },
}

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>
}) {
  const { authorization_id: authorizationId } = await searchParams
  if (!authorizationId?.trim()) {
    return (
      <AuthShell title="Falta la solicitud" subtitle="Este enlace de autorización no es válido.">
        <p className="text-sm text-muted-foreground">
          Vuelve a conectar WanderPlanner desde el asistente.
        </p>
      </AuthShell>
    )
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (!claims) {
    redirect(loginWithConsent(authorizationId))
  }

  if (claims.is_anonymous === true) {
    redirect(signupWithConsent(authorizationId))
  }

  const { data: authDetails, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId)

  if (error || !authDetails) {
    return (
      <AuthShell
        title="No se pudo cargar la solicitud"
        subtitle="La autorización ha caducado o no es válida."
      >
        <p className="text-sm text-muted-foreground">
          {error?.message || "Vuelve a conectar WanderPlanner desde el asistente."}
        </p>
      </AuthShell>
    )
  }

  if (!("authorization_id" in authDetails)) {
    redirect(authDetails.redirect_url)
  }

  const scopes = splitScopes(authDetails.scope)
  const clientName = authDetails.client.name?.trim() || "Una aplicación"
  // Qué cuenta se conecta = la de la cookie de sesión de ESTE navegador, no la
  // del cliente OAuth. Con dos cuentas (la personal y una de pruebas) no hay
  // otra forma de notar que estás autorizando la equivocada, porque una sesión
  // ya abierta salta el login y cae directa en esta pantalla.
  const accountEmail = typeof claims.email === "string" ? claims.email.trim() : ""

  return (
    <AuthShell
      title={`¿Permitir a ${clientName}?`}
      subtitle="Quiere acceder a tus viajes de WanderPlanner, en modo lectura."
    >
      {accountEmail ? (
        <p className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Se conectará tu cuenta{" "}
          <span className="font-medium text-foreground">{accountEmail}</span>
        </p>
      ) : null}

      {scopes.length > 0 ? (
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-foreground/80">
          {scopes.map((scope) => (
            <li key={scope}>{describeScope(scope)}</li>
          ))}
        </ul>
      ) : null}

      <p className="mb-6 text-sm text-muted-foreground">
        WanderPlanner usa esa autorización para identificarte. No usa tu teléfono. El
        asistente recibe el plan de tus viajes en lectura; el detalle está en la{" "}
        <Link
          href="/legal/privacidad#asistentes"
          className="font-medium text-foreground underline underline-offset-4"
        >
          política de privacidad
        </Link>
        .
      </p>

      <form action="/oauth/decision" method="POST" className="flex flex-col gap-3">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <Button type="submit" name="decision" value="approve" className="h-11">
          Aprobar
        </Button>
        <Button type="submit" name="decision" value="deny" variant="outline" className="h-11">
          Denegar
        </Button>
      </form>
    </AuthShell>
  )
}
