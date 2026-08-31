# Plantillas de correo de Auth

Copia versionada de las plantillas de **Authentication → Emails** del proyecto
Supabase. **El CLI no las despliega**: se pegan a mano en el dashboard. Este
directorio existe porque, si no, viven solo ahí — sin historial, sin revisión y
sin forma de recuperarlas si alguien las rompe.

Al tocar una: edita el fichero, pega el resultado en el dashboard y commitea.

## Qué plantilla dispara cada flujo

| Flujo del producto | Llamada | Plantilla |
| --- | --- | --- |
| Alta normal en `/signup` | `signUp()` | **Confirm sign up** |
| Invitado que guarda su viaje | `updateUser({ email, password })` | **Change Email Address** |
| Reenvío al invitado | `updateUser({ email })` | **Change Email Address** |
| Recuperar contraseña | `resetPasswordForEmail()` | **Reset Password** |

Las dos de en medio son [`upgradeGuest`](../../frontend/lib/auth-context.tsx) y
`linkGuestEmail`. Para GoTrue, poner correo a un usuario **que ya existe** —el
anónimo— es un cambio de email (`type=email_change`), no un alta. De ahí que un
invitado reciba la plantilla que se llama "Change Email Address".

## Las dos trampas

**`{{ .Email }}` sale vacío en el cambio de email.** Ahí `.Email` es la
dirección **actual** y `.NewEmail` la nueva; un usuario anónimo no tiene actual.
Por eso `change-email-address.html` usa `{{ .NewEmail }}`. En **Confirm sign up**
sí es `{{ .Email }}`, que ahí es la buena.

**Cambiar de correo no existe en el producto.** `/account/settings` lo tiene en
solo lectura, y en todo el frontend hay tres `updateUser`: dos son los del
invitado y el tercero solo toca la contraseña. Así que "Change Email Address" se
escribe **para el invitado**, sin intentar servir a dos públicos. Si algún día
se añade cambiar de correo de verdad, hay que reescribirla para los dos casos
(y entonces harán falta `.Email` y `.NewEmail`).

## A dónde vuelve el enlace

Lo decide `emailRedirectTo` en la llamada, **no** la plantilla. Sin él, GoTrue
usa el Site URL del proyecto y el usuario acaba en la landing. Los flujos de
invitado apuntan a `/auth/callback?next=/trips?confirmed=1`, que canjea el
código por sesión y deja el aviso en el listado.

El canje es PKCE: el verificador vive en el navegador que **inició** el flujo.
Abrir el enlace en otro navegador falla y cae en `/login?error=auth`. Por eso la
plantilla pide abrirlo donde se creó la cuenta.
