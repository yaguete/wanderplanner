---
name: wanderplanner-traffic
description: >-
  Informe de tráfico y activación de WanderPlanner (visitas, invitados,
  cuentas, fuentes, clics salientes) cruzando Vercel Analytics y Supabase.
  Use when the user asks about visitas, tráfico, analytics, embudo, invitados,
  registros, fuentes indexadas, clics a Booking/Skyscanner, o un recuento de
  ayer/esta semana; or mentions Vercel Analytics, funnel_events, or
  wanderplanner.ai traffic.
---

# WanderPlanner · seguimiento de tráfico

Eres el analista de producto. El fundador pregunta en español si **alguien de verdad** usó la app, no un dashboard genérico.

Ventana por defecto: **ayer, Europe/Madrid**. Si pide «esta semana» o fechas, úsalas. Convierte a UTC para Vercel.

## IDs

| Pieza | ID |
|---|---|
| Supabase | `kzriijgdkrdruikmpufl` (proyecto WanderPlanner) |
| Vercel team | `team_f9DR86W9nckEuIvwthX0w5V3` |
| Vercel project | `prj_zA8P8kqF1z6mdrScwsydI6dyKyGC` |

MCP: `plugin-supabase-supabase` → `execute_sql`. `plugin-vercel-vercel` → `get_web_analytics` (si `needsAuth`, `mcp_auth` y reintenta).

SQL listo en [queries.md](queries.md). Sustituye `:from` / `:to` por `timestamptz 'YYYY-MM-DD HH:MI:SS Europe/Madrid'`.

## Privacidad (no se negocia)

El informe **nunca** lleva: emails, nombres, IPs completas, user-agents, UUIDs de usuario, URLs con query, ni el texto de `meta` crudo si contiene `://` o `@`.

Sí: `is_anonymous`, `signup_referrer`, `/24` (no el host), ISP si hace falta, `ref`/`post_slug`, dominio de fuente, booleanos (`tiene_email`).

Si Auto-review bloquea un SQL, **no** pidas aprobación para leer emails o UA. Reformula: quita `email`, `user_agent`, `host(ip)`. IP solo como `set_masklen(s.ip::inet, 24)`.

`funnel_events` **no** tiene `user_id` ni IP a propósito. El join con viajes es por `post_slug` + tiempo, no por persona.

## Cómo está montado (no lo re-instrumentes)

Dos capas, no una:

| Capa | Qué es | Consentimiento | Dónde |
|---|---|---|---|
| Embudo CTA | `funnel()` → `POST /funnel` → `funnel_events` | No. `start_opened` **antes** del captcha | Supabase, 90 días |
| Web Analytics | `@vercel/analytics` + Speed Insights | Sí (`wp-consent=all`, `AnalyticsGate`) | Vercel, agregados |
| Producto | `trips`, `sources`, `auth.users`, `usage_events`, `article_extractions` | Contrato / límites | Supabase |

`track()` de Vercel (landing, onboarding, sugerencias de fuente) **existe en código** y **no se puede consultar** en el plan actual (API eventos custom → 402). Ignóralo. El denominador del CTA es `funnel_events`, no Analytics.

Nombres de embudo: `start_opened`, `outbound_click`, `account_created`. Meta de clic: `target` (booking/skyscanner/getyourguide/kayak/stay22/other), `affiliate` (partner/own/none), `surface`.

`ref=wp-landing` es chip de la home, **no** un partner. Partners reales: p. ej. `lacosmopolilla`.

## Tú vs el resto

Contaminación del fundador: casi todo el tráfico histórico es él. Clasifica **antes** de hablar de «visitas reales».

**Eres tú si** encaja uno:

1. `profiles.signup_referrer = 'SinMapa'` (cuenta principal).
2. Sesión en una red de casa conocida: `79.155.19.0/24`, `79.155.115.0/24` (actualiza si cambia el ISP).
3. `ref` reservado (`wp-landing`, `landing`, `start`, `admin`) **y** red de casa.
4. Cuenta registrada que **también** ha tenido sesión en esas /24 (segunda cuenta de prueba).

**Es otro si**: invitado o cuenta nueva, `ref` de partner real, **y** `/24` que no es de casa. ISP residencial ES (Movistar, Vodafone, Orange) > datacenter.

Un `start_opened` duplicado en el mismo milisegundo es doble disparo, no dos personas.

Analytics unique visitors **no** se suman por hora. `count` a veces ignora el rango: usa `aggregate` + `by: ["day"]` o `["hour"]`.

## Orden de trabajo

1. Autentica MCP si hace falta. Confirma proyecto WanderPlanner (el otro, `va-cross-prototype`, está inactivo).
2. SQL en paralelo: embudo, usuarios nuevos, viajes, fuentes, extracciones, usage, sesiones `/24`, outbound.
3. Vercel en paralelo: totales por día, paths, `referrerHostname`, country, device. Filtro `requestPath eq '/start'`.
4. Cruza. Headline primero: ¿hubo alguien que no fueras tú?
5. Responde en español con la plantilla de abajo.

## Qué cuenta como «le interesa»

No uses pageviews como éxito. Pirámide, de más barato a más caro de fingir:

1. **Llegada** — `start_opened` con `ref` de partner (o `/` con referrer externo en Vercel).
2. **Pasó el gate** — invitado + fila en `trips` (Turnstile). Borrador vacío + `created_at = updated_at` = rebote (caso Tenerife).
3. **Activación** — extrajo fuente (`sources` o `usage_events.kind=extraction`) **o** mutó el viaje después de crearlo. Esto es el norte: alguien planeó de verdad.
4. **Intención de reserva** — `outbound_click` (da igual partner/own/none).
5. **Retorno** — mismo `user_id` con actividad horas o días después (caso Coruña).
6. **Cuenta** — `account_created` o `is_anonymous=false` creado en la ventana. Aún no es el objetivo.

También reporta, si hay datos:

- **Hueco de consentimiento**: invitados nuevos en Auth vs unique visitors de Analytics. Analytics es un mínimo.
- **Fuente nueva vs caché**: `article_extractions` con `fetched_at` (o primera vez de esa `url`) en la ventana = indexado nuevo; `sources` sobre una URL ya cacheada = reuso.
- **Quién afilia** el clic: `affiliate=partner` (bloguero) vs `own` (Booking/Skyscanner nuestros).

No inventes eventos nuevos en el informe. Si falta una métrica, dilo como laguna, no la simules.

## Informe (plantilla)

```markdown
## Lo corto
- [1–3 frases: ¿hubo alguien real? cuántos, qué hicieron]

## Embudo (Madrid, ventana)
- Vercel (con cookies): N visitantes, M páginas. Referrers. Países/dispositivos.
- CTA: start_opened / pasaron captcha / extrajeron / outbound / cuentas.

## No eres tú
- Una viñeta por persona/sesión: de dónde (partner + post + ISP/red, no IP), qué hizo, si rebotó o se activó.

## Fuiste tú
- En una línea: chips landing, viajes que creaste, segunda cuenta si aplica.

## Fuentes
- Añadidas a un viaje (dominio/autor, no URL completa si trae query).
- Indexadas nuevas en `article_extractions` vs reuso de caché.

## Clics fuera
- target × affiliate × surface. Booking/Skyscanner/GetYourGuide/…

## Cómo leerlo
- Analytics ≤ actividad real (consentimiento).
- start_opened ≥ /start en Vercel (se dispara antes del captcha y sin cookies).
```

No pongas tablas enormes. Si no hubo actividad real, dilo en la primera línea.

## No hagas

- No añadas eventos, tablas ni `track()` «de paso». Este skill **lee**.
- No consultes el dataset `events` de Vercel (402 en Hobby).
- No uses el proyecto Supabase `va-cross-prototype`.
- No pongas `/start` como «visita de marketing» si `ref=wp-landing` y la red es de casa.
