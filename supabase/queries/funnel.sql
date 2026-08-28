-- Consultas del embudo CTA. Copiar y pegar en el SQL Editor de Supabase.
-- El CLI solo ejecuta `migrations/`; este fichero no corre solo.
--
-- Convención: `ref` = slug del partner (p. ej. lacosmopolilla).
-- `post_slug` = último segmento del path del artículo, NO la URL.

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
       count(*) filter (where name = 'start_opened')                 as visitas,
       count(*) filter (where name = 'account_created')              as cuentas,
       round(100.0 * count(*) filter (where name = 'account_created')
             / nullif(count(*) filter (where name = 'start_opened'), 0), 1) as conversion_pct
from funnel_events
where at > now() - interval '7 days'
  and ref = 'lacosmopolilla'
group by post
order by visitas desc;

-- ── Mismo embudo, por partner ───────────────────────────────────────────────
select coalesce(ref, '(directo)')                                    as partner,
       count(*) filter (where name = 'start_opened')                 as visitas,
       count(*) filter (where name = 'account_created')              as cuentas,
       round(100.0 * count(*) filter (where name = 'account_created')
             / nullif(count(*) filter (where name = 'start_opened'), 0), 1) as conversion_pct
from funnel_events
where at > now() - interval '7 days'
group by ref
order by visitas desc;

-- ── Tendencia semanal (ventana GTM de 4 semanas) ────────────────────────────
select date_trunc('week', at)::date                                  as semana,
       count(*) filter (where name = 'start_opened')                 as visitas,
       count(*) filter (where name = 'account_created')              as cuentas
from funnel_events
where at > now() - interval '28 days'
  and ref = 'lacosmopolilla'
group by 1
order by semana;

-- ── P4 · Qué viajes están configurando. Cero instrumentación: sale de trips.
select coalesce(nullif(t.name, ''), '(sin nombre)') as viaje,
       t.countries,
       t.num_days,
       t.num_travelers,
       t.seed_source_key is not null                as vino_de_un_cta,
       t.referrer,
       t.created_at::date                           as dia
from trips t
where t.created_at > now() - interval '7 days'
  and t.archived = false
order by t.created_at desc;

-- ── P5 · Clics salientes: a dónde y de quién es la afiliación ───────────────
select meta->>'target'    as destino,
       meta->>'affiliate' as afiliacion,
       count(*)           as clics
from funnel_events
where name = 'outbound_click'
  and at > now() - interval '7 days'
group by destino, afiliacion
order by clics desc;

-- ── Abandono en el captcha, POR POST ────────────────────────────────────────
-- Cota superior, no cifra exacta: un invitado que reusa viaje genera
-- start_opened sin fila nueva en trips. El join va por el path, no por ref
-- (los 10 posts de un blog comparten ref).
with llegadas as (
  select post_slug, count(*) as llegadas
  from funnel_events
  where name = 'start_opened'
    and at > now() - interval '7 days'
  group by post_slug
),
pasaron as (
  select split_part(split_part(seed_source_key, '?', 1), '/', -1) as post_slug,
         count(*) as pasaron_el_gate
  from trips
  where seed_source_key is not null
    and created_at > now() - interval '7 days'
  group by 1
)
select l.post_slug,
       l.llegadas,
       coalesce(p.pasaron_el_gate, 0)              as pasaron_el_gate,
       l.llegadas - coalesce(p.pasaron_el_gate, 0) as se_perdieron_en_el_gate
from llegadas l
left join pasaron p using (post_slug)
order by l.llegadas desc;

-- ── Exposición al gate de registro, últimos 7 días ──────────────────────────
-- `gate_shown` se emite una vez por sesión y motivo, con la misma guarda que
-- `start_opened`, así que las dos columnas son comparables. Contesta lo que
-- `account_created` por sí solo no puede: ¿la gente ve la petición de cuenta y
-- la rechaza, o no llega a verla? Son dos diagnósticos opuestos con el mismo
-- número de altas.
select coalesce(ref, '(directo)')                       as partner,
       count(*) filter (where name = 'start_opened')    as llegadas,
       count(*) filter (where name = 'gate_shown')      as vieron_la_peticion,
       count(*) filter (where name = 'account_created') as cuentas
from funnel_events
where at > now() - interval '7 days'
group by ref
order by llegadas desc;

-- ── Qué acción provoca la petición de cuenta ────────────────────────────────
-- Si domina `home`, es el recordatorio automático de los 3 minutos: a nadie le
-- hizo falta la cuenta, solo pasó el tiempo. El resto de motivos sí son
-- intención (querer otra fuente, compartir, invitar), y señalan qué merece la
-- pena poner detrás del email.
select meta->>'reason'           as motivo,
       count(*)                  as veces,
       count(distinct post_slug) as posts
from funnel_events
where name = 'gate_shown'
  and at > now() - interval '7 days'
group by motivo
order by veces desc;

-- ── Higiene: nada de URLs, emails ni user_id en la tabla ────────────────────
select *
from funnel_events
where name ~* '://'
   or coalesce(ref, '') ~* '://|@'
   or coalesce(post_slug, '') ~* '://|@|/'
   or meta::text ~* '://|@';
