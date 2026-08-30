-- Vigilancia de coste del complemento de ChatGPT (T9.9a).
-- Copiar y pegar en el SQL Editor de Supabase. El CLI solo ejecuta
-- `migrations/`; este fichero no corre solo.
--
-- QUÉ CUESTA DINERO EN EL MCP: solo `get_country_tasks`. Las otras seis tools
-- leen de PostgREST con el token del usuario y no gastan nada. Esa tool llama a
-- `GET /country-tasks` en Fly con el Bearer del usuario, así que el backend le
-- aplica `enforce_usage` y escribe `kind='country_tasks'` en `usage_events`.
--
-- LIMITACIÓN, dicha por delante: `usage_events` NO guarda de dónde vino la
-- llamada. Un `country_tasks` del complemento y uno de la pestaña Básicos son
-- la misma fila. Estas consultas miden el gasto TOTAL de ese kind; lo que se
-- puede afirmar es «subió desde que se publicó el complemento», no «lo gastó el
-- complemento». Atribuir de verdad exigiría una columna nueva, y no compensa.
--
-- Retención: `cleanup_usage_events()` corre a las 04:15 UTC y se lleva lo que
-- pasa de 35 días. Las ventanas de aquí no van más atrás a propósito.

-- ── 1) Gasto diario del único kind de pago del MCP ──────────────────────────
-- El número a mirar después de publicar. Un escalón sostenido = tracción; un
-- pico de un día = probablemente un bucle (mira la consulta 3).
select date_trunc('day', created_at)::date as dia,
       count(*)                            as llamadas,
       count(distinct user_id)             as usuarios,
       round(avg(cost_hint), 1)            as coste_medio_hint
from usage_events
where kind = 'country_tasks'
  and created_at > now() - interval '30 days'
group by dia
order by dia desc;

-- ── 2) Foto general: todos los kinds, últimos 7 días ────────────────────────
-- Contexto. Si `country_tasks` se dispara pero `extraction` y
-- `assistant_message` siguen planos, el tráfico nuevo entra por el complemento.
select kind,
       count(*)                as eventos,
       count(distinct user_id) as usuarios,
       max(created_at)         as ultimo
from usage_events
where created_at > now() - interval '7 days'
group by kind
order by eventos desc;

-- ── 3) Bucle de reintentos: un usuario machacando country_tasks ─────────────
-- EL FALLO QUE YA VIMOS: si una condición terminal (cuota agotada, 429) se le
-- presenta al modelo como transitoria, reintenta todo el día. Estas son las
-- horas-usuario con más de 10 llamadas; en uso normal no sale nadie.
select user_id,
       date_trunc('hour', created_at) as hora,
       count(*)                       as llamadas
from usage_events
where kind = 'country_tasks'
  and created_at > now() - interval '7 days'
group by user_id, hora
having count(*) > 10
order by llamadas desc, hora desc
limit 50;

-- ── 4) Tope global durable de fotos ─────────────────────────────────────────
-- No es del MCP (el complemento no pide miniaturas), pero es el único cinturón
-- que puede dejar el producto sin imágenes, y se agota en silencio.
-- Compara contra MAX_PHOTO_LOOKUPS_DAY.
--
-- VENTANA MÓVIL DE 24 h, no día natural: `allow_paid_lookup()` cuenta con
-- `since = now - 1 día` (backend/photo_lookup.py). Con `date_trunc('day', …)`
-- el número saldría más bajo que el que el cinturón está mirando de verdad.
select count(*) as photo_paid_24h
from usage_events
where kind = 'photo_paid'
  and created_at > now() - interval '24 hours';

-- ── 5) Altas nuevas que llegan por el complemento ───────────────────────────
-- Un usuario cuya PRIMERA huella en usage_events es country_tasks no venía de
-- la web: entró por el complemento. Es lo más cerca que estamos de medir
-- adquisición desde ChatGPT sin tocar el esquema.
with primera as (
  select user_id,
         min(created_at)                                     as primera_vez,
         (array_agg(kind order by created_at))[1]            as primer_kind
  from usage_events
  where user_id is not null
    and created_at > now() - interval '30 days'
  group by user_id
)
select date_trunc('day', primera_vez)::date as dia,
       primer_kind,
       count(*)                             as usuarios_nuevos
from primera
group by dia, primer_kind
order by dia desc, usuarios_nuevos desc;
