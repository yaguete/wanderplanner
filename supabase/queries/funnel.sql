-- Consultas de lectura del embudo CTA. Ventanas móviles para exploración.
-- Para informes reproducibles usar .cursor/skills/wanderplanner-traffic/queries.md
-- con bordes explícitos [desde, hasta), Europe/Madrid. No sumar ventanas solapadas.
-- Los resultados son eventos/filas, no personas ni una cohorte enlazada.
-- El CLI solo ejecuta `migrations/`; este fichero no corre solo.
--
-- Convención: `ref` = slug del partner (p. ej. lacosmopolilla).
-- `post_slug` = último segmento del path del artículo, NO la URL.
-- Slugs reservados (`wp-landing`, `wp-sources`, `landing`, `start`, `admin`)
-- no son partners: exclúyelos del agrupado por `ref` o salen como fila más.

-- ── Tamaño de tablas (control semanal) ──────────────────────────────────────
select relname,
       pg_size_pretty(pg_total_relation_size(c.oid)) as tamano
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc
limit 10;

-- ── Embudo POR POST, últimos 7 días ─────────────────────────────────────────
select coalesce(post_slug, '(sin post)')                             as post,
       count(*) filter (where name = 'start_opened')                 as eventos_llegada,
       count(*) filter (where name = 'account_created')              as eventos_alta,
       round(100.0 * count(*) filter (where name = 'account_created')
             / nullif(count(*) filter (where name = 'start_opened'), 0), 1) as ratio_eventos_pct
from funnel_events
where at > now() - interval '7 days'
  and ref = 'lacosmopolilla'
group by post
order by eventos_llegada desc;

-- ── Mismo embudo, por partner ───────────────────────────────────────────────
select coalesce(ref, '(directo)')                                    as partner,
       count(*) filter (where name = 'start_opened')                 as eventos_llegada,
       count(*) filter (where name = 'account_created')              as eventos_alta,
       round(100.0 * count(*) filter (where name = 'account_created')
             / nullif(count(*) filter (where name = 'start_opened'), 0), 1) as ratio_eventos_pct
from funnel_events
where at > now() - interval '7 days'
  and (ref is null or ref not in ('wp-landing', 'wp-sources', 'landing', 'start', 'admin', 'codex-audit'))
group by ref
order by eventos_llegada desc;

-- ── Tendencia semanal (ventana GTM de 4 semanas) ────────────────────────────
select date_trunc('week', at at time zone 'Europe/Madrid')::date                                  as semana,
       count(*) filter (where name = 'start_opened')                 as eventos_llegada,
       count(*) filter (where name = 'account_created')              as eventos_alta
from funnel_events
where at > now() - interval '28 days'
  and ref = 'lacosmopolilla'
group by 1
order by semana;

-- ── P4 · Borradores persistidos; no demuestra planificación deliberada.
-- Incluye archivados. Sin nombres libres ni identificadores de usuario.
select coalesce(t.referrer, '(sin ref)') as origen,
       count(*) as viajes_creados,
       count(*) filter (where t.seed_source_key is not null) as con_seed,
       count(*) filter (where coalesce(cardinality(t.source_ids), 0) > 0) as con_fuentes_actuales
from public.trips t
where t.created_at > now() - interval '7 days'
group by 1
order by viajes_creados desc;

-- ── P5 · Clics salientes: a dónde y de quién es la afiliación ───────────────
select meta->>'target'    as destino,
       meta->>'affiliate' as afiliacion,
       count(*)           as clics
from funnel_events
where name = 'outbound_click'
  and at > now() - interval '7 days'
group by destino, afiliacion
order by clics desc;

-- ── Desajuste entre llegadas y viajes nuevos, por ref y post ────────────────
-- NO mide abandonos del captcha ni una cota garantizada.
-- Reutilización, seeds cambiados, fallos de eventos, ventanas y normalización
-- pueden producir diferencias, incluso negativas. No hay join por persona.
-- Normalización básica: no reproduce toda la decodificación Unicode del frontend.
with llegadas as (
  select ref, post_slug, count(*) as eventos_llegada
  from public.funnel_events
  where name = 'start_opened'
    and at > now() - interval '7 days'
  group by 1, 2
), viajes as (
  select referrer as ref,
         nullif(regexp_replace(
           regexp_replace(split_part(split_part(seed_source_key, '?', 1), '#', 1), '/+$', ''),
           '^.*/', ''), '') as post_slug,
         count(*) as viajes_nuevos
  from public.trips
  where seed_source_key is not null
    and created_at > now() - interval '7 days'
  group by 1, 2
)
select coalesce(l.ref, v.ref, '(sin ref)') as origen,
       coalesce(l.post_slug, v.post_slug, '(sin post)') as post,
       coalesce(l.eventos_llegada, 0) as eventos_llegada,
       coalesce(v.viajes_nuevos, 0) as viajes_nuevos,
       coalesce(l.eventos_llegada, 0) - coalesce(v.viajes_nuevos, 0)
         as diferencia_agregada_no_causal
from llegadas l
full outer join viajes v
  on coalesce(l.ref, '') = coalesce(v.ref, '')
 and coalesce(l.post_slug, '') = coalesce(v.post_slug, '')
order by eventos_llegada desc, viajes_nuevos desc;

-- ── Eventos de petición de cuenta, últimos 7 días ─────────────────────────
-- Starts: guarda por sesión de pestaña/ref/post; gates: por sesión/motivo.
-- Se pueden mostrar juntos, pero no dividir como tasa de personas expuestas.
-- Varios motivos pueden proceder de la misma sesión. No hay ID para enlazarlos.
-- Desde el despliegue del 28 ago 2026 (parcial ese día); antes no instrumentado.
select coalesce(ref, '(directo)')                       as partner,
       count(*) filter (where name = 'start_opened')    as llegadas,
       count(*) filter (where name = 'gate_shown')      as eventos_peticion,
       count(*) filter (where name = 'account_created') as eventos_alta
from funnel_events
where at > now() - interval '7 days'
group by ref
order by llegadas desc;

-- ── Qué acción provoca la petición de cuenta ────────────────────────────────
-- home es temporizado (3 minutos, luego 5); otros motivos son acciones bloqueadas.
-- No prueban acción completada, rechazo deliberado del registro ni pago.
select meta->>'reason'           as motivo,
       count(*)                  as veces,
       count(distinct post_slug) as posts
from funnel_events
where name = 'gate_shown'
  and at > now() - interval '7 days'
group by motivo
order by veces desc;

-- ── Higiene: nada de URLs, emails ni user_id en la tabla ────────────────────
select count(*) as filas_con_anomalias
from funnel_events
where name ~* '://'
   or coalesce(ref, '') ~* '://|@'
   or coalesce(post_slug, '') ~* '://|@|/'
   or meta::text ~* '://|@';
