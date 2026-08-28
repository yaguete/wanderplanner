# Consultas del informe de tráfico

Sustituye `:from` y `:to` por timestamps Madrid, p. ej.:

```sql
timestamptz '2026-08-20 00:00:00 Europe/Madrid'
timestamptz '2026-08-21 00:00:00 Europe/Madrid'
```

Proyecto: `kzriijgdkrdruikmpufl`. Nada de `email`, `user_agent` ni `host(ip)`.

Redes de casa del fundador (actualiza si cambia el ISP):

```sql
-- usar en `s.ip << net` :
-- '79.155.19.0/24'::inet
-- '79.155.115.0/24'::inet
```

---

## 1. Embudo

```sql
select name,
       coalesce(ref, '(directo)') as partner,
       coalesce(post_slug, '(sin post)') as post,
       meta->>'target' as target,
       meta->>'affiliate' as affiliate,
       meta->>'surface' as surface,
       meta->>'sourceKind' as source_kind,
       count(*) as n,
       min(at at time zone 'Europe/Madrid') as first_madrid,
       max(at at time zone 'Europe/Madrid') as last_madrid
from funnel_events
where at >= :from and at < :to
group by 1, 2, 3, 4, 5, 6, 7
order by first_madrid;
```

Detalle (para cruzar hora a hora; `meta` ya está sanitizado en origen):

```sql
select name, ref, post_slug, meta,
       at at time zone 'Europe/Madrid' as at_madrid
from funnel_events
where at >= :from and at < :to
order by at;
```

---

## 2. Altas: invitados vs cuentas

Sin emails.

```sql
select u.is_anonymous,
       (u.email is not null) as tiene_email,
       p.signup_referrer,
       count(*) as n,
       min(u.created_at at time zone 'Europe/Madrid') as first_madrid,
       max(u.created_at at time zone 'Europe/Madrid') as last_madrid
from auth.users u
left join public.profiles p on p.id = u.id
where u.created_at >= :from and u.created_at < :to
group by 1, 2, 3
order by n desc;
```

Sesiones nuevas en la ventana, por red /24 (quién es «otro»):

```sql
select set_masklen(s.ip::inet, 24)::text as red,
       count(distinct s.user_id) as usuarios,
       count(*) as sesiones,
       count(*) filter (
         where s.ip << '79.155.19.0/24'::inet
            or s.ip << '79.155.115.0/24'::inet
       ) as ses_casa,
       min(s.created_at at time zone 'Europe/Madrid') as first_madrid,
       max(s.created_at at time zone 'Europe/Madrid') as last_madrid
from auth.sessions s
where s.created_at >= :from and s.created_at < :to
  and s.ip is not null
group by 1
order by usuarios desc;
```

Cuentas registradas que **entraron** (no hace falta que se crearan ayer). `last_sign_in_at` no se actualiza si reusan refresh token: contrasta con `usage_events` y `trips.updated_at`.

```sql
select u.is_anonymous,
       p.signup_referrer,
       count(distinct u.id) as usuarios
from auth.users u
left join public.profiles p on p.id = u.id
where u.last_sign_in_at >= :from and u.last_sign_in_at < :to
group by 1, 2;
```

---

## 3. Viajes (activación)

```sql
select coalesce(nullif(t.name, ''), '(sin nombre)') as viaje,
       t.referrer,
       t.seed_source_key,
       t.archived,
       cardinality(t.source_ids) as n_fuentes,
       jsonb_array_length(coalesce(t.days, '[]'::jsonb)) as n_dias,
       (t.updated_at = t.created_at) as sin_actividad_posterior,
       p.signup_referrer,
       u.is_anonymous,
       (t.created_at at time zone 'Europe/Madrid') as created_madrid,
       (t.updated_at at time zone 'Europe/Madrid') as updated_madrid
from trips t
join auth.users u on u.id = t.user_id
left join profiles p on p.id = t.user_id
where t.created_at >= :from and t.created_at < :to
order by t.created_at;
```

`seed_source_key` es el artículo del CTA (dominio + path, sin query). No lo imprimas si trae `?`; recorta en `split_part(..., '?', 1)`.

Viajes **tocados** aunque se crearan antes (usuario logado que vuelve):

```sql
select coalesce(nullif(t.name, ''), '(sin nombre)') as viaje,
       t.referrer,
       u.is_anonymous,
       p.signup_referrer,
       (t.updated_at at time zone 'Europe/Madrid') as updated_madrid
from trips t
join auth.users u on u.id = t.user_id
left join profiles p on p.id = t.user_id
where t.updated_at >= :from and t.updated_at < :to
order by t.updated_at;
```

---

## 4. Fuentes usadas e indexadas

En un viaje (lo que el usuario añadió):

```sql
select split_part(regexp_replace(s.url, '^https?://(www\.)?', ''), '/', 1) as dominio,
       s.author,
       s.area,
       s.title,
       u.is_anonymous,
       p.signup_referrer,
       (s.created_at at time zone 'Europe/Madrid') as created_madrid
from sources s
join auth.users u on u.id = s.user_id
left join profiles p on p.id = s.user_id
where s.created_at >= :from and s.created_at < :to
order by s.created_at;
```

Caché global: **primera vez** que se indexa esa URL vs revalidación.

```sql
select split_part(regexp_replace(url, '^https?://(www\.)?', ''), '/', 1) as dominio,
       (fetched_at at time zone 'Europe/Madrid') as fetched_madrid,
       (validated_at at time zone 'Europe/Madrid') as validated_madrid,
       (fetched_at >= :from and fetched_at < :to) as indexado_en_ventana
from article_extractions
where (fetched_at >= :from and fetched_at < :to)
   or (validated_at >= :from and validated_at < :to)
order by fetched_at;
```

`indexado_en_ventana = true` y no había fila previa = fuente nueva para todo el mundo. `validated_at` en ventana con `fetched_at` antiguo = revalidación, no es un artículo nuevo.

---

## 5. Uso de producto (sin PII)

```sql
select kind,
       count(*) as n,
       count(distinct user_id) as usuarios,
       count(*) filter (where user_id is null) as sin_user
from usage_events
where created_at >= :from and created_at < :to
group by kind
order by n desc;
```

Por usuario anónimo vs registrado (para ver si el gasto es tuyo):

```sql
select coalesce(u.is_anonymous, true) as invitado,
       e.kind,
       count(*) as n
from usage_events e
left join auth.users u on u.id = e.user_id
where e.created_at >= :from and e.created_at < :to
  and e.user_id is not null
group by 1, 2
order by 1, n desc;
```

Kinds útiles para activación: `extraction`, `extraction_instagram`, `assistant_message`, `day_summary`, `country_tasks`, `trip_source_search`. `photo_paid` / `photo_lookup` son thumbs: ruido si el fundador abre la Ruta.

---

## 6. Clics salientes

Ya cubierto en (1) filtrando `name = 'outbound_click'`. Resumen:

```sql
select coalesce(ref, '(directo)') as partner,
       meta->>'target' as destino,
       meta->>'affiliate' as afiliacion,
       meta->>'surface' as superficie,
       count(*) as clics
from funnel_events
where name = 'outbound_click'
  and at >= :from and at < :to
group by 1, 2, 3, 4
order by clics desc;
```

---

## 7. Vercel MCP

`get_web_analytics` con `teamId` + `projectId`. `since`/`until` en ISO UTC de los bordes Madrid.

| mode | dataset | by | para qué |
|---|---|---|---|
| aggregate | visits | `["day"]` | tendencia (límite 14) |
| aggregate | visits | `["hour"]` | un día concreto |
| aggregate | visits | `["requestPath"]` | páginas, limit 20 |
| aggregate | visits | `["referrerHostname"]` | de dónde |
| aggregate | visits | `["country"]` | país |
| aggregate | visits | `["deviceType"]` | móvil/desktop |
| aggregate | visits | `["hour"]` + filter `requestPath eq '/start'` | CTA con cookies |

No uses `dataset: events` (402). El `mode: count` a veces recorta mal el rango: no te fíes de él.

Visitas a un viaje concreto (`/trips/<uuid>`) → cruza el uuid con la query (3) para saber si es tu viaje o el de un invitado.

---

## 8. Heurística del gate del CAPTCHA (cota, no cifra exacta)

> Esto es Turnstile, no la modal de registro. Para la petición de cuenta, ve a la 9.

Un invitado que reusa viaje genera `start_opened` sin fila nueva. El join es por slug de path, no por persona.

```sql
with llegadas as (
  select post_slug, count(*) as llegadas
  from funnel_events
  where name = 'start_opened'
    and at >= :from and at < :to
  group by post_slug
),
pasaron as (
  select split_part(split_part(seed_source_key, '?', 1), '/', -1) as post_slug,
         count(*) as pasaron_el_gate
  from trips
  where seed_source_key is not null
    and created_at >= :from and created_at < :to
  group by 1
)
select l.post_slug,
       l.llegadas,
       coalesce(p.pasaron_el_gate, 0) as pasaron_el_gate
from llegadas l
left join pasaron p using (post_slug)
order by l.llegadas desc;
```

---

## 9. La petición de cuenta (`gate_shown`, desde el 28 ago 2026)

Contesta lo que `account_created` por sí solo no puede: ¿la ven y la rechazan, o no llegan a verla? En ventanas anteriores al 28 ago 2026 esto da cero porque el evento no existía — dilo, no lo reportes como 0.

`gate_shown` se emite una vez por sesión y motivo, con la misma guarda que `start_opened`, así que las columnas son comparables.

```sql
select coalesce(ref, '(directo)')                       as partner,
       count(*) filter (where name = 'start_opened')    as llegadas,
       count(*) filter (where name = 'gate_shown')      as vieron_la_peticion,
       count(*) filter (where name = 'account_created') as cuentas
from funnel_events
where at >= :from and at < :to
group by 1
order by llegadas desc;
```

Por motivo. `home` es el recordatorio automático (3 min la primera vez, luego cada 5; no intención); los otros seis son acciones que el usuario quiso hacer y que le pidieron cuenta:

```sql
select meta->>'reason'           as motivo,
       count(*)                  as veces,
       count(distinct post_slug) as posts
from funnel_events
where name = 'gate_shown'
  and at >= :from and at < :to
group by 1
order by veces desc;
```

Y por post, para cruzar con qué artículo trae a esa gente:

```sql
select coalesce(post_slug, '(sin post)')             as post,
       count(*) filter (where name = 'start_opened') as llegadas,
       count(*) filter (where name = 'gate_shown')   as vieron_la_peticion
from funnel_events
where at >= :from and at < :to
  and ref is not null and ref <> 'wp-landing'
group by 1
order by llegadas desc;
```
