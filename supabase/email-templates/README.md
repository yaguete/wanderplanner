# Plantillas de correo de Auth

Copia versionada de las plantillas de **Authentication → Emails** del proyecto
Supabase. **El CLI no las despliega**: se pegan a mano en el dashboard. Este
directorio existe porque, si no, viven solo ahí — sin historial, sin revisión y
sin forma de recuperarlas si alguien las rompe.

Al tocar una: edita el fichero, pega el resultado en el dashboard y commitea.

## Orden de deploy (no invertirlo)

1. Merge y deploy a Vercel de `/auth/confirm`.
2. Humo: `GET https://wanderplanner.ai/auth/confirm` sin params →
   `/login?error=link`.
3. **Entonces** pegar las tres plantillas en Authentication → Emails.

Si pegas las plantillas antes, el enlace TokenHash 404.

## Qué plantilla dispara cada flujo

| Flujo del producto | Llamada | Plantilla | `type` |
| --- | --- | --- | --- |
| Alta normal en `/signup` | `signUp()` | **Confirm sign up** (`confirm-signup.html`) | `signup` |
| Invitado que guarda su viaje | `updateUser({ email, password })` | **Change Email Address** (`change-email-address.html`) | `email_change` |
| Reenvío al invitado | `updateUser({ email })` | **Change Email Address** | `email_change` |
| Recuperar contraseña | `resetPasswordForEmail()` | **Reset Password** (`reset-password.html`) | `recovery` |

Las dos de en medio son [`upgradeGuest`](../../frontend/lib/auth-context.tsx) y
`linkGuestEmail`. Para GoTrue, poner correo a un usuario **que ya existe** —el
anónimo— es un cambio de email (`type=email_change`), no un alta. De ahí que un
invitado reciba la plantilla que se llama "Change Email Address".

No tocar **Invite user**. No añadir Magic Link.

## TokenHash, no PKCE

El href lo construye la plantilla:

```
https://wanderplanner.ai/auth/confirm?token_hash={{ .TokenHash }}&type=…&next=…
```

`/auth/confirm` llama a `verifyOtp({ token_hash, type })` en servidor. No hay
code verifier: el enlace vale en **cualquier navegador**. Eso no es magic
link — el usuario sigue teniendo contraseña; `type=magiclink` se rechaza.

`{{ .ConfirmationURL }}` es el flujo PKCE viejo (`/auth/callback` +
`exchangeCodeForSession`). Los enlaces ya enviados lo usan y caducan a las
24 h; por eso `/auth/callback` no se toca (además lo necesita Google SSO).

## Origen fijo, no `{{ .SiteURL }}`

El Site URL del proyecto lleva **barra final** (`https://wanderplanner.ai/`).
`{{ .SiteURL }}/auth/confirm` renderiza `https://wanderplanner.ai//auth/confirm`.
Las tres plantillas escriben `https://wanderplanner.ai` a mano. Local tiene
`enable_confirmations = false`: estas plantillas solo se ejercen en producción.

## `next` va encoded

`next=/trips?confirmed=1` **sin** `%3F` hace que `confirmed=1` sea una query
hermana y el toast del listado no salga. En Change Email es
`next=/trips%3Fconfirmed%3D1`.

## Destino en dos sitios

El `next` de invitado y el de recuperación viven en la plantilla **y** en
`emailRedirectTo` / `redirectTo` de [`auth-context.tsx`](../../frontend/lib/auth-context.tsx)
(`guestEmailRedirectTo`, `signUp`, `requestPasswordReset`). Las plantillas
TokenHash ignoran `emailRedirectTo`; ConfirmationURL sí lo usa. Si cambias un
aterrizaje, cambia los dos. No apuntar `emailRedirectTo` a `/auth/confirm`:
ConfirmationURL llega con `code`, y esa ruta solo entiende `token_hash`.

## Las dos trampas de siempre

**`{{ .Email }}` sale vacío en el cambio de email.** Ahí `.Email` es la
dirección **actual** y `.NewEmail` la nueva; un usuario anónimo no tiene actual.
Por eso `change-email-address.html` usa `{{ .NewEmail }}`. En **Confirm sign up**
sí es `{{ .Email }}`.

**Cambiar de correo no existe en el producto.** `/account/settings` lo tiene en
solo lectura. "Change Email Address" se escribe **para el invitado**.

## Escáneres de correo (decisión: asumirlo)

Un `token_hash` es de un solo uso y se consume con un GET. Outlook Safe Links y
compañía abren el href al entregarlo: cuando el usuario pulsa, el token ya
está gastado. Con PKCE molestaba menos (el `code` no servía sin el verificador).

No hay interstitial POST. El público es consumidor español en Gmail, que no
pre-carga de forma agresiva. La defensa es el copy: «caducado o ya se ha
usado», con vía para pedir otro (`/login?error=link`,
`/forgot-password?error=link`). Si el síntoma aparece en real, el siguiente
paso es un GET que pinta un botón y el `verifyOtp` en el POST.

## Navegador de origen

Si el invitado confirma en el móvil, el escritorio conserva un JWT
`is_anonymous` hasta que vuelva el foco. `AuthProvider` llama a
`refreshGuestStatus` en `focus` / `visibilitychange` (y el gate tiene «Ya lo
he confirmado»). No hace falta recargar a mano.
