# AGENTS.md

## Cursor Cloud specific instructions

WanderPlanner es un monorepo con tres piezas de desarrollo local:

| Servicio | Carpeta | Comando dev | Puerto | Notas |
| --- | --- | --- | --- | --- |
| Frontend (Next.js 15) | `frontend/` | `npm run dev` | 3000 | Lee `frontend/.env.local`. |
| Backend (FastAPI) | `backend/` | `python3 -m uvicorn main:app --host 0.0.0.0 --port 8000` | 8000 | Lee `backend/.env`. |
| Supabase local (Postgres + Auth + PostgREST) | `supabase/` | `supabase start` | 54321 (API), 54322 (DB), 54323 (Studio) | Requiere Docker. Aplica las migraciones de `supabase/migrations/` al arrancar. |

Los comandos estándar de lint/test/build son los de [`.github/workflows/ci.yml`](.github/workflows/ci.yml): frontend `npx tsc --noEmit` → `npm run test:*` (suite por fichero con `tsx`, ver scripts en `frontend/package.json`) → `npm run lint` (gate: 0 errores; los warnings del React Compiler están degradados y no bloquean) → `npm run build`; backend `python -c "import main"` → `pytest`. Los tests de frontend/backend y el lint **no** necesitan Supabase ni claves.

### Puesta en marcha del stack local (no está en el update script)

El update script solo refresca dependencias (`npm ci` + `pip install`). Docker, el CLI de Supabase y el arranque de servicios son **manuales** por VM (son dependencias de sistema / arranque de servicio):

1. **Docker** (docker-in-docker): instalar `docker-ce`, usar `fuse-overlayfs` como storage driver y, en Docker 29+, **desactivar** `containerd-snapshotter` en `/etc/docker/daemon.json` (si no, `fuse-overlayfs` no funciona). Usar `iptables-legacy`. Arrancar `sudo dockerd` en segundo plano (no hay systemd).
2. **Supabase CLI**: instalar el `.deb` de la última release de `supabase/cli`.
3. `supabase start` desde `/workspace` (levanta el stack y aplica las migraciones de `supabase/migrations/`). Verificar con `supabase status`.

### Archivos de entorno (gitignored — hay que recrearlos)

- **No existe `frontend/.env.example`**; solo `backend/.env.example`. Los ficheros `frontend/.env.local` y `backend/.env` están en `.gitignore` y no se commitean.
- Para el stack local, rellénalos con las claves demo que imprime `supabase status` (son públicas y bien conocidas, no secretos reales):
  - `frontend/.env.local`: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>`, `NEXT_PUBLIC_API_URL=http://localhost:8000`.
  - `backend/.env`: `SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>`, `SUPABASE_JWT_SECRET=<JWT_SECRET>`, `REQUIRE_AUTH=false`.

### Caveats no obvios

- `supabase/config.toml` está commiteado **solo para el stack local** (`supabase start`); tiene `enable_anonymous_sign_ins = true` (necesario para el flujo invitado de `/start`), `enable_confirmations = false` (registro sin confirmar email) y `http://localhost:3000` en redirect URLs. No copies esos valores al proyecto gestionado. Las migraciones de producción van con `supabase db push` (CLI vinculada; historial alineado con el repo desde el 30 ago 2026). No las apliques por MCP ni pegando SQL en el editor: descuadra los timestamps. Detalle y `migration repair` en [`supabase/README.md`](supabase/README.md).
- **No corras `npm run build` con `npm run dev` levantado en `frontend/`.** Comparten `.next/`: el build reescribe los chunks bajo los pies del dev server y este empieza a soltar `Cannot find module './7719.js'` y 404 en `/_next/static/…`. En el navegador un chunk que da 404 rechaza su promesa con un `Event`, así que lo único que se ve es `Error: [object Event]` — sin pista del origen. Se sale parando el servidor, `rm -rf .next` y arrancando otra vez (y recarga dura en el navegador, que tiene los chunks viejos en caché). Para pasar el gate con el dev arriba, o lo paras antes o construyes con otro directorio (`next build --distDir .next-ci`).
- `pip install` va con `--user` (Ubuntu 24.04 marca el entorno como externally-managed); los binarios quedan en `~/.local/bin`. Añade `~/.local/bin` al `PATH` para invocar `uvicorn` / `pytest` directamente, o usa `python3 -m uvicorn` / `python3 -m pytest`.
- **Crear cuenta + crear viaje** (el hello-world del producto) funciona solo con Frontend + Supabase local; el backend no interviene en ese flujo. La persistencia va directa del navegador a Supabase (RLS) vía `trip-context` / `trips-repo`.
- Las features de IA y de imágenes/mapa (`/itinerary`, `/assistant/chat`, `/thumb`, `/cover`, `/sources/suggest`, Mapbox) necesitan claves externas de pago (`ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `TAVILY_API_KEY`, `GOOGLE_PLACES_API_KEY`, `UNSPLASH_ACCESS_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`) que **no** están en este entorno. Sin ellas el resto de la app arranca; solo se degradan esas rutas concretas.
- Node local y CI van en la 22. Python 3.12 en ambos.
