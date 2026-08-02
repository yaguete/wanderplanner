# WanderPlanner — Despliegue

Arquitectura en producción (privada, sin anunciar tráfico):

| Pieza | Plataforma | URL / recurso |
| --- | --- | --- |
| Frontend (Next.js 15) | **Vercel** · Root Directory = `frontend` | `https://wanderplanner.ai` |
| Backend (FastAPI) | **Fly.io** · app `wanderplanner-api` · región `ams` | `https://api.wanderplanner.ai` (también `https://wanderplanner-api.fly.dev`) |
| Postgres + Auth | **Supabase** (gestionados) | proyecto `kzriijgdkrdruikmpufl` · `eu-west-1` |

Código de referencia: [`backend/fly.toml`](backend/fly.toml), [`backend/Dockerfile`](backend/Dockerfile), [`backend/.env.example`](backend/.env.example), [`frontend/.env.example`](frontend/.env.example), [`supabase/README.md`](supabase/README.md).

Smoke test tras un deploy:

```bash
./scripts/smoke.sh https://api.wanderplanner.ai
```

---

## 1. Backend — Fly.io

### App y región

- App: `wanderplanner-api`
- Región primaria: `ams` (Ámsterdam). Fly cerró `mad`; otras EU cercanas: `cdg`, `fra`, `lhr`.
- Certificado custom: `fly certs add api.wanderplanner.ai` (CNAME del dominio hacia el hostname de Fly).
- Runtime: imagen de [`backend/Dockerfile`](backend/Dockerfile) · puerto interno `8000` · `auto_stop_machines = stop` / `min_machines_running = 0` · 1 GB RAM.

### Deploy

Desde `backend/` (o pasando `-c backend/fly.toml` / `--config`):

```bash
# Primera vez (ya hecho): fly launch --no-deploy --name wanderplanner-api --region ams
cd backend
fly deploy
fly status
fly logs
```

### Secrets (obligatorios en producción)

```bash
fly secrets set \
  ANTHROPIC_API_KEY=... \
  DEEPSEEK_API_KEY=... \
  TAVILY_API_KEY=... \
  GOOGLE_PLACES_API_KEY=... \
  UNSPLASH_ACCESS_KEY=... \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  REQUIRE_AUTH=true \
  ALLOWED_ORIGINS=https://wanderplanner.ai
```

Listar / rotar:

```bash
fly secrets list
fly secrets set NOMBRE=nuevo_valor   # redeploy implícito
```

| Variable | De dónde sale | Notas |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) → API keys | Extracción `/itinerary` (Claude Haiku) |
| `DEEPSEEK_API_KEY` | [platform.deepseek.com](https://platform.deepseek.com/) | Asistente `/assistant/chat` |
| `TAVILY_API_KEY` | [tavily.com](https://tavily.com/) → dashboard | Búsqueda web del asistente |
| `GOOGLE_PLACES_API_KEY` | Google Cloud → APIs & Services → Places API (New) | Miniaturas `/thumb`. Acepta también alias `GOOGLE_MAPS_API_KEY` |
| `UNSPLASH_ACCESS_KEY` | [unsplash.com/oauth/applications](https://unsplash.com/oauth/applications) | Portadas `/cover` (solo backend; **nunca** `NEXT_PUBLIC_*`) |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Mismo proyecto que el front |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` | **Solo backend.** Cachés `article_extractions` / `place_thumbs` / `destination_covers` y `usage_events` |
| `REQUIRE_AUTH` | — (configuración propia) | `true` en producción. Sin Bearer → 401 en `/itinerary`, `/thumb`, `/cover`, `/assistant/chat` |
| `ALLOWED_ORIGINS` | — | CSV de orígenes CORS. Prod: `https://wanderplanner.ai`. Añade URLs de Preview de Vercel si quieres probar APIs desde previews |

#### Opcionales

| Variable | Default / efecto |
| --- | --- |
| `SUPABASE_JWT_SECRET` | Si falta, valida por JWKS de `SUPABASE_URL`. Preferible **no** fijarlo si los tokens son asimétricos (ES256/RS256); un secreto HS256 desalineado provoca «Token de sesión inválido» |
| `ASSISTANT_MODEL` | `deepseek-v4-flash` |
| `ITINERARY_MAX_OUTPUT_TOKENS` | `32000` (tope 64000) |
| `EXTRACTION_CACHE_TTL_DAYS` | `30` |
| `MAX_PHOTO_LOOKUPS_DAY` | `2000` (cinturón global de misses `/thumb`+`/cover`) |
| `GUEST_MAX_EXTRACTIONS` | `1` |
| `GUEST_MAX_ASSISTANT_MESSAGES` | `10` |
| `GUEST_MAX_PHOTO_LOOKUPS` | `30` |
| `USER_MAX_EXTRACTIONS_DAY` | `10` |
| `USER_MAX_EXTRACTIONS_MONTH` | `50` |
| `USER_MAX_ASSISTANT_MESSAGES_DAY` | `50` |
| `USER_MAX_PHOTO_LOOKUPS_DAY` | `300` |

### Rollback (Fly)

No hay `fly rollback`. Se redeploya una imagen anterior del registry:

```bash
fly releases --app wanderplanner-api --image
# Elige la release buena, p. ej. registry.fly.io/wanderplanner-api:deployment-01H…
fly deploy --app wanderplanner-api --image registry.fly.io/wanderplanner-api:<tag>
```

Opcional: etiquetar deploys legibles con `fly deploy --image-label v1.2.3` para no depender solo de tags `deployment-…`. Las imágenes no usadas mucho tiempo pueden podarse del registry de Fly; para rollback “garantizado” conviene también un registry externo.

Los **secrets** no vuelven atrás con la imagen: si un secret nuevo rompió prod, corrígelo con `fly secrets set` / `unset`.

---

## 2. Frontend — Vercel

### Proyecto

1. Importar el repo `yaguete/wanderplanner` (o el remoto actual).
2. **Root Directory: `frontend`** (crítico: el `package.json` de Next vive ahí).
3. Framework preset: Next.js. Build / install por defecto (`npm run build`).
4. Dominio producción: `wanderplanner.ai` → este proyecto.

Cada push a `main` despliega Production; ramas / PRs generan Preview.

### Variables de entorno (Production y Preview)

Configurar en Vercel → Project → Settings → Environment Variables. Todas son `NEXT_PUBLIC_*` (van al bundle del navegador):

| Variable | De dónde sale | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Hostname del backend | Prod: `https://api.wanderplanner.ai`. Preview: misma API o una de staging si la hubiera |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → URL | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` `public` | Pública; RLS protege datos. **Nunca** la `service_role` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | [account.mapbox.com](https://account.mapbox.com/) → Access tokens | Token `pk.…` **restringido por URL** a `wanderplanner.ai` (y previews si hace falta) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile → site key | Misma clave que Bot protection en Supabase Auth. Sin ella, `/start` no muestra captcha |

Opcional: `NEXT_PUBLIC_VENDOR_LOGO_PROVIDER` (default `clearbit`).

**No** poner en Vercel: `UNSPLASH_ACCESS_KEY`, `GOOGLE_PLACES_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, ni ninguna clave de IA.

### Deploy manual (CLI)

```bash
cd frontend
vercel link          # una vez
vercel --prod        # o dejar que el Git integration despliegue
```

### Rollback (Vercel)

Instant Rollback — apunta el dominio de producción a un deployment anterior **sin rebuild**:

```bash
# Hobby: solo el deployment de producción inmediatamente anterior
vercel rollback

# Pro/Enterprise: a uno concreto
vercel rollback <deployment-id-or-url>
vercel rollback status
```

También desde el dashboard: Deployment → … → Instant Rollback.

Tras un rollback, Vercel desactiva la asignación automática de dominios de producción a nuevos pushes. Para volver al flujo normal: `vercel promote <deployment-id-or-url>` (o “Undo Rollback” en el dashboard).

---

## 3. Supabase (gestionados)

No hay “deploy” de app: el proyecto ya está en la nube. Lo que se despliega son **migraciones** y la **configuración de Auth**.

### Checklist de producción

- Authentication → Providers → **Anonymous Sign-Ins** activado (`/start`).
- Authentication → **Bot protection (Turnstile)** con la misma site key que `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- Authentication → URL Configuration:
  - Site URL: `https://wanderplanner.ai`
  - Redirect URLs: `https://wanderplanner.ai/**` + URLs de Preview de Vercel (`https://*.vercel.app/**` o las concretas).
- Custom SMTP (Resend u otro) si quieres entrega real de emails de confirmación; el SMTP por defecto de Supabase no basta para usuarios reales.
- Migraciones aplicadas (en orden):

  1. `20260726220000_init_wanderplanner.sql`
  2. `20260726223000_cleanup_anonymous_users.sql`
  3. `20260726230000_grant_data_api.sql`
  4. `20260728000000_place_thumbs_and_covers.sql`
  5. `20260728120000_usage_events.sql`

```bash
# Con CLI vinculada al proyecto:
supabase db push
# O pegar cada fichero en SQL Editor, en orden.
```

Detalle local y env: [`supabase/README.md`](supabase/README.md).

### Rollback (Supabase)

- **Esquema:** las migraciones son forward-only. No hay `supabase db rollback` en producción. Para deshacer un cambio ya aplicado: escribe una **nueva migración compensatoria** (down SQL revisado a mano) y haz `supabase db push`.
- **Nunca** `supabase db reset --linked` contra producción (borra datos).
- **Datos:** el plan Free no tiene backups automáticos ni PITR. La continuidad depende de dumps periódicos (ver deuda T7.3 del plan de producción). Un restore es restaurar un `pg_dump` / backup manual, no “un botón de rollback”.

---

## 4. Entornos: local vs Preview vs Production

| | Local | Preview (Vercel) | Production |
| --- | --- | --- | --- |
| Front | `localhost:3000` | `*.vercel.app` | `wanderplanner.ai` |
| API | `localhost:8000` | suele apuntar a la API de prod o a Fly | `api.wanderplanner.ai` |
| `REQUIRE_AUTH` | `false` (cómodo) | — (backend) | `true` |
| `ALLOWED_ORIGINS` | defaults `localhost:3000,3001` | incluir el origen del preview si llamas a la API real | `https://wanderplanner.ai` |
| Supabase redirects | `http://localhost:3000/**` | URLs preview | Site URL + `wanderplanner.ai/**` |
| Claves de imagen | solo `backend/.env` | solo Fly secrets | solo Fly secrets |

Coordinación típica al abrir un Preview que habla con la API de producción:

1. Añadir el origen del Preview a `ALLOWED_ORIGINS` en Fly (`fly secrets set …`).
2. Añadir el mismo origen a Redirect URLs de Supabase Auth.
3. Si Mapbox está restringido por URL, autorizar también el host del preview.

---

## 5. Verificación post-deploy

Checklist mínima (Fase 2 / T2.5 del plan de producción):

1. Alta con email real → confirmación → login → crear viaje → persiste al recargar.
2. `/start?source=<url>&ref=…` en incógnito → captcha → viaje con fuente, sin cuenta.
3. Segunda fuente como invitado → 429 → modal de registro.
4. Asistente en streaming (SSE Vercel→Fly sin buffering).
5. Portadas y miniaturas al hacer scroll; **cero** claves de Places/Unsplash en el bundle.
6. Artículo largo (15+ días) sin cortarse.
7. `./scripts/smoke.sh https://api.wanderplanner.ai` en verde.

---

## 6. Comandos rápidos

```bash
# Backend
cd backend && fly deploy
fly status -a wanderplanner-api
fly logs -a wanderplanner-api
fly releases -a wanderplanner-api --image
fly deploy -a wanderplanner-api --image registry.fly.io/wanderplanner-api:<tag>   # rollback

# Frontend
cd frontend && vercel --prod
vercel rollback                 # Instant Rollback
vercel promote <deployment>     # deshacer rollback / reactivar auto-assign

# Supabase
supabase db push                # migraciones pendientes (forward-only)
# Rollback de esquema = nueva migración compensatoria, no un undo mágico

# Smoke
./scripts/smoke.sh https://api.wanderplanner.ai
```
