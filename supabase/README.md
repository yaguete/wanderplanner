# Supabase — WanderPlanner

Proyecto: `https://kzriijgdkrdruikmpufl.supabase.co`

## Una vez creado el proyecto

1. **Auth → Providers → Anonymous Sign-Ins → Enable**  
   Sin esto, `/start` (modo invitado del CTA de blogs) falla al llamar `signInAnonymously`.

2. **Auth → URL Configuration**  
   Añade `http://localhost:3000/**` (y el dominio de producción) en Redirect URLs. Site URL: `http://localhost:3000` en local.

3. **Aplicar migraciones** (SQL Editor → New query, o CLI):

```bash
# Opción A: pegar en orden el contenido de
#   migrations/20260726220000_init_wanderplanner.sql
#   migrations/20260726223000_cleanup_anonymous_users.sql
#   migrations/20260726230000_grant_data_api.sql

# Opción B (si tienes Supabase CLI vinculado):
supabase db push
```

4. **Project Settings → API** → copia `URL` y `anon public` a `frontend/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://….supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ…
```

5. **Backend** (`backend/.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (caché de extracciones) y, en producción, `REQUIRE_AUTH=true` + `SUPABASE_JWT_SECRET` (JWT Secret en Settings → API) o confiar en el JWKS del proyecto.

## Opcional

- **Bot protection / Turnstile** en Auth Settings si rellenas `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- **pg_cron**: la migración de cleanup intenta programar `cleanup_anonymous_users()` a las 04:00 UTC; si la extensión no está disponible, invoca la función a mano.
