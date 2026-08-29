import type { Metadata } from "next"
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

  return (
    <AuthShell
      title={`¿Permitir a ${clientName}?`}
      subtitle="Quiere acceder a tus viajes de WanderPlanner, en modo lectura."
    >
      {scopes.length > 0 ? (
        <ul className="mb-6 list-disc space-y-1 pl-5 text-sm text-foreground/80">
          {scopes.map((scope) => (
            <li key={scope}>{describeScope(scope)}</li>
          ))}
        </ul>
      ) : null}

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
