---
name: wanderplanner-traffic
description: >-
  Informe de tráfico y activación de WanderPlanner (visitas, invitados,
  peticiones de cuenta, registros, fuentes, clics salientes) cruzando Vercel
  Analytics y Supabase, y volcado del resultado en la nota de seguimiento del
  vault. Use when the user asks about visitas, tráfico, analytics, embudo,
  invitados, registros, fuentes indexadas, clics a Booking/Skyscanner, o un
  recuento de ayer/esta semana; or mentions Vercel Analytics, funnel_events,
  gate_shown, criterio de vida, or wanderplanner.ai traffic.
---

# WanderPlanner · seguimiento de tráfico

Eres el analista de producto. El fundador pregunta en español si **alguien de verdad** usó la app, no un dashboard genérico.

Ventana por defecto: **ayer, Europe/Madrid**. Si pide «esta semana» o fechas, úsalas. Convierte a UTC para Vercel.

## El resultado se escribe SIEMPRE en el vault

Registro único, no negociable:

```
/Users/yago/Library/Mobile Documents/iCloud~md~obsidian/Documents/notas_de_yago/🚀 Personal/🚧 Pet Projects/WanderPlanner/WanderPlanner-embudo-seguimiento.md
```

Toda lectura del embudo termina ahí, además de contestar en el chat. Tres sitios dentro del fichero:

1. **`## Registro`** — una fila nueva en la tabla, con la fecha de la lectura. **Nunca** reescribas filas anteriores: el registro es un historial, no un estado.
2. **`## Lecturas del embudo (texto libre)`** — una subsección `### YYYY-MM-DD` con la lectura en prosa: qué post tira, qué cambió, hipótesis. Aquí va lo que no cabe en una celda.
3. **Tabla del criterio de vida** — actualiza solo `Día del reloj` y `Acumulado a día de hoy`.

Reglas del registro, que existen por una razón concreta:

- **Si una lectura no está en el fichero, NO significa que no se hiciera.** Significa que no se anotó. Antes de este registro el plan pedía anotar «en la daily», sin sitio fijo, y durante días se concluyó por escrito —y en falso— que «la tabla no se ha consultado ni una vez». **No vuelvas a escribir «cero consultas» ni «lleva N días sin mirarse» en ningún documento.** Si necesitas saber si se miró, se mira aquí; si aquí no hay nada, se pregunta.
- El **criterio de vida** son **10 emails en 4 semanas**; reloj desde el **17 ago 2026**, vence el **14 sep 2026**. Ese número **no** sale de `account_created`: sale del panel de Authentication de Supabase (o de `auth.users`). `funnel_events` solo añade atribución.
- Si el fichero no existe, dilo y para. No lo recrees de cero ni inventes historial.

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

Nombres de embudo: `start_opened`, `outbound_click`, `account_created`, `gate_shown`. Meta de clic: `target` (booking/skyscanner/getyourguide/kayak/stay22/other), `affiliate` (partner/own/none), `surface`. Meta de alta: `onboarding`. Meta de `gate_shown`: `reason`.

### `gate_shown` — la petición de cuenta (desde el 28 ago 2026)

La modal de registro (`RegistrationGate`) se ha puesto delante de un invitado. Existe porque `account_created` por sí solo es ambiguo: con pocas altas no distingues **«la ven y la rechazan»** (problema de producto: nada detrás del email) de **«no llegan a verla»** (problema de sitio y momento). Son diagnósticos opuestos con el mismo número.

- `meta.reason`, lista cerrada de 7: `new-trip`, `second-source`, `home`, `source-limit`, `assistant-limit`, `invite`, `share-plan`. La misma lista vive en `FUNNEL_GATE_REASONS` (frontend) y en `ALLOWED_META_VALUES["reason"]` (backend); si divergen, el evento se descarta en silencio.
- **`home` es el recordatorio automático de los 3 minutos**, no intención: a nadie le hizo falta la cuenta, solo pasó el tiempo. Los otros seis sí son intención, y señalan qué merecería la pena poner detrás del email.
- Se emite **una vez por sesión y motivo**, con la misma guarda de `sessionStorage` que `start_opened` — así las dos columnas son comparables. Sin esa guarda contaría insistencias (la modal se reabre sola cada 3 min), no personas.
- **No existe antes del 28 ago 2026.** En ventanas anteriores da cero y ese cero no significa nada: dilo explícitamente en el informe en vez de reportar 0.
- Ojo con el nombre: esto es el **gate de registro**. El «gate» de la consulta 8 de [queries.md](queries.md) es el **captcha** (Turnstile). No los mezcles.

`ref=wp-landing` es chip de la home, **no** un partner. Partners reales: p. ej. `lacosmopolilla`.

## Tú vs el resto

Contaminación del fundador: casi todo el tráfico histórico es él. Clasifica **antes** de hablar de «visitas reales».

Estado verificado a **28 ago 2026** en el panel de Authentication: **3 usuarios registrados en total, y dos son del equipo** — Patricia Rojas (la bloguera) y Yago. El único registro ajeno es **Victoria**. Con `auth.users` en cifras de un dígito, comprueba ahí antes de deducir nada del embudo.

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
6. **Vuelca el resultado** en `WanderPlanner-embudo-seguimiento.md`: fila nueva en `## Registro`, subsección `### YYYY-MM-DD` en las lecturas en texto libre, y `Día del reloj` / `Acumulado` al día. Di en el chat que lo has anotado y dónde.

## Qué cuenta como «le interesa»

No uses pageviews como éxito. Pirámide, de más barato a más caro de fingir:

1. **Llegada** — `start_opened` con `ref` de partner (o `/` con referrer externo en Vercel).
2. **Pasó el gate** — invitado + fila en `trips` (Turnstile). Borrador vacío + `created_at = updated_at` = rebote (caso Tenerife).
3. **Activación** — extrajo fuente (`sources` o `usage_events.kind=extraction`) **o** mutó el viaje después de crearlo. Esto es el norte: alguien planeó de verdad.
4. **Intención de reserva** — `outbound_click` (da igual partner/own/none).
5. **Retorno** — mismo `user_id` con actividad horas o días después (caso Coruña).
6. **Vio la petición de cuenta** — `gate_shown`. No es un logro del usuario, es un dato tuyo: mide si la pregunta llegó a hacerse. Repórtalo siempre junto a `start_opened` y a las altas, nunca solo.
7. **Cuenta** — `account_created` o `is_anonymous=false` creado en la ventana. Es el que decide el criterio de vida, y se confirma contra Authentication, no contra el evento.

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
- CTA: start_opened / pasaron captcha / extrajeron / **vieron la petición de cuenta** / outbound / cuentas.

## La petición de cuenta
- Cuántos `gate_shown` frente a `start_opened`, y por qué motivo (`meta.reason`).
- Separa `home` (recordatorio de los 3 min) del resto (intención real).
- Si la ventana es anterior al 28 ago 2026: «el evento aún no existía», no «0».

## No eres tú
- Una viñeta por persona/sesión: de dónde (partner + post + ISP/red, no IP), qué hizo, si rebotó o se activó.

## Fuiste tú
- En una línea: chips landing, viajes que creaste, segunda cuenta si aplica.

## Criterio de vida
- Día N/28 (reloj desde el 17 ago 2026, vence el 14 sep). Emails de lector real acumulados, contra Authentication.

## Fuentes
- Añadidas a un viaje (dominio/autor, no URL completa si trae query).
- Indexadas nuevas en `article_extractions` vs reuso de caché.

## Clics fuera
- target × affiliate × surface. Booking/Skyscanner/GetYourGuide/…

## Cómo leerlo
- Analytics ≤ actividad real (consentimiento).
- start_opened ≥ /start en Vercel (se dispara antes del captcha y sin cookies).
- gate_shown es una vez por sesión y motivo: comparable con start_opened, no con el número de veces que se insiste.
- El criterio de vida se cuenta en Authentication, no en account_created.
```

No pongas tablas enormes. Si no hubo actividad real, dilo en la primera línea.

## No hagas

- No añadas eventos, tablas ni `track()` «de paso». Este skill **lee la base de datos**; lo único que escribe es la nota de seguimiento del vault.
- No reportes `gate_shown = 0` en ventanas anteriores al 28 ago 2026 sin decir que el evento aún no existía.
- No afirmes que el embudo «no se está mirando». Ese juicio ya se escribió en falso una vez y contaminó media docena de notas.
- No consultes el dataset `events` de Vercel (402 en Hobby).
- No uses el proyecto Supabase `va-cross-prototype`.
- No pongas `/start` como «visita de marketing» si `ref=wp-landing` y la red es de casa.
