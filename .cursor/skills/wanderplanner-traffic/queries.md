# Consultas para el informe de tráfico

Proyecto: `kzriijgdkrdruikmpufl`. Solo lecturas. Sustituye **todos** los `:from` y `:to` por los mismos bordes Madrid, p. ej.:

```sql
timestamptz '2026-09-02 00:00:00 Europe/Madrid'
timestamptz '2026-09-03 00:00:00 Europe/Madrid'
```

Ventana semiabierta. Guarda bordes, fecha de consulta, filtros y cobertura. Estas consultas dan agregados; ninguna reconstruye una cohorte de personas del CTA. Para excluir equipo se necesita una correspondencia de cuentas confirmada: un ref, ISP o red no la sustituye. No devuelvas identificadores de usuario, emails, nombres de viajes ni metadatos libres.

## 1. Eventos del embudo

```sql
select name,
       coalesce(ref, '(sin ref)') as origen,
       coalesce(post_slug, '(sin post)') as post,
       meta->>'target' as target,
       meta->>'affiliate' as affiliate,
       meta->>'surface' as surface,
       meta->>'sourceKind' as source_kind,
       meta->>'reason' as motivo,
       count(*) as eventos,
       min(at at time zone 'Europe/Madrid') as primero_madrid,
       max(at at time zone 'Europe/Madrid') as ultimo_madrid
from public.funnel_events
where at >= :from and at < :to
group by 1, 2, 3, 4, 5, 6, 7, 8
order by primero_madrid;
```

Las claves devueltas están restringidas en origen por `backend/funnel.py`; si se investiga higiene, cuenta anomalías sin devolver su contenido. Para una secuencia puntual usa las mismas columnas permitidas y `at`, no `select *` ni `meta` crudo. Hora/post coincidentes no enlazan una persona con un evento.

`start_opened` se deduplica por pestaña/ref/post; `gate_shown` por pestaña/motivo. `account_created` no es un censo. No renombres `eventos` como visitantes ni calcules personas expuestas sumando motivos.

## 2. Authentication: estado, creación de identidad y confirmaciones

**Censo actual**, independiente de la ventana:

```sql
select u.is_anonymous,
       nullif(u.email, '') is not null as tiene_email,
       u.email_confirmed_at is not null as email_confirmado,
       coalesce(p.signup_referrer, '(sin ref)') as origen_perfil,
       count(*) as identidades_actuales
from auth.users u
left join public.profiles p on p.id = u.id
group by 1, 2, 3, 4
order by 1, 2, 3, 4;
```

**Actividad temporal de identidades** (columnas que pueden solaparse, no sumar):

```sql
select u.is_anonymous as estado_anonimo_actual,
       coalesce(p.signup_referrer, '(sin ref)') as origen_perfil,
       count(*) filter (
         where u.created_at >= :from and u.created_at < :to
       ) as identidades_creadas,
       count(*) filter (
         where u.created_at >= :from and u.created_at < :to
           and nullif(u.email, '') is not null
       ) as creadas_que_hoy_tienen_email,
       count(*) filter (
         where u.email_confirmed_at >= :from and u.email_confirmed_at < :to
       ) as confirmaciones_en_ventana,
       count(*) filter (
         where u.last_sign_in_at >= :from and u.last_sign_in_at < :to
       ) as ultimo_login_en_ventana
from auth.users u
left join public.profiles p on p.id = u.id
where (u.created_at >= :from and u.created_at < :to)
   or (u.email_confirmed_at >= :from and u.email_confirmed_at < :to)
   or (u.last_sign_in_at >= :from and u.last_sign_in_at < :to)
group by 1, 2
order by 1, 2;
```

Un invitado puede convertirse con `updateUser` manteniendo ID y `created_at`: **identidades creadas no equivale a altas de email**. Confirmación y conversión tampoco son el mismo evento. Un censo actual no recupera cuentas borradas. `last_sign_in_at` conserva solo el último login y no todos los usos/refresh. Si no hay historial verificable de conversión, informa la limitación.

Redes: **solo si son necesarias**, como indicio auxiliar, nunca clasificación automática. Elimina bits de host antes de devolver:

```sql
select network(set_masklen(s.ip::inet,
         case when family(s.ip::inet) = 4 then 24 else 48 end))::text as prefijo,
       count(distinct s.user_id) as identidades_con_sesion,
       count(*) as filas_sesion
from auth.sessions s
where s.created_at >= :from and s.created_at < :to
  and s.ip is not null
group by 1
order by filas_sesion desc;
```

Una identidad puede estar en varios prefijos; no sumar como únicos globales. La falta de sesiones no prueba ausencia de uso. No mostrar IP completa ni usar `set_masklen` solo.

## 3. Viajes: persistencia, no activación por defecto

```sql
select coalesce(t.referrer, '(sin ref)') as origen_viaje,
       u.is_anonymous as estado_anonimo_actual,
       coalesce(p.signup_referrer, '(sin ref)') as origen_perfil,
       count(*) filter (
         where t.created_at >= :from and t.created_at < :to
       ) as viajes_creados,
       count(*) filter (
         where t.created_at >= :from and t.created_at < :to
           and t.seed_source_key is not null
       ) as creados_con_seed,
       count(*) filter (
         where t.created_at >= :from and t.created_at < :to
           and coalesce(cardinality(t.source_ids), 0) > 0
       ) as creados_con_fuente_actual,
       count(*) filter (
         where t.updated_at >= :from and t.updated_at < :to
       ) as viajes_con_ultima_escritura_en_ventana
from public.trips t
join auth.users u on u.id = t.user_id
left join public.profiles p on p.id = t.user_id
where (t.created_at >= :from and t.created_at < :to)
   or (t.updated_at >= :from and t.updated_at < :to)
group by 1, 2, 3
order by 1, 2, 3;
```

Incluye archivados: si se excluyen, anota que cambias la población. El estado de fuentes y `updated_at` son actuales, no snapshot al cerrar la ventana. La última escritura puede desplazar una anterior; no reconstruye todas las ediciones históricas. Un viaje/fuente automática no demuestra uso deliberado; fechas iguales no prueban rebote.

## 4. Fuentes y caché

Fuentes incorporadas (pueden proceder automáticamente del CTA):

```sql
select split_part(regexp_replace(s.url, '^https?://(www\\.)?', ''), '/', 1) as dominio,
       u.is_anonymous as estado_anonimo_actual,
       coalesce(p.signup_referrer, '(sin ref)') as origen_perfil,
       count(*) as fuentes_creadas
from public.sources s
join auth.users u on u.id = s.user_id
left join public.profiles p on p.id = s.user_id
where s.created_at >= :from and s.created_at < :to
group by 1, 2, 3
order by fuentes_creadas desc;
```

Caché actual:

```sql
select split_part(regexp_replace(url, '^https?://(www\\.)?', ''), '/', 1) as dominio,
       count(*) filter (
         where fetched_at >= :from and fetched_at < :to
       ) as filas_con_ultima_extraccion_en_ventana,
       count(*) filter (
         where validated_at >= :from and validated_at < :to
       ) as filas_con_ultima_validacion_en_ventana
from public.article_extractions
where (fetched_at >= :from and fetched_at < :to)
   or (validated_at >= :from and validated_at < :to)
group by 1
order by 1;
```

`store_extraction` sobrescribe `fetched_at` en un upsert. No llames a esas filas «artículos indexados por primera vez»: hace falta snapshot previo/historial para probarlo. Las columnas se solapan; una fila puede recibir varios fetches. Dominio se obtiene de URLs de fuentes; si se sospecha contenido inválido, agrupa contra dominios permitidos en vez de devolver texto libre.

## 5. Uso y posible retorno

```sql
select e.kind,
       u.is_anonymous as estado_anonimo_actual,
       coalesce(p.signup_referrer, '(sin ref)') as origen_perfil,
       count(*) as registros_de_uso,
       count(distinct e.user_id) as identidades_no_nulas,
       count(*) filter (where e.user_id is null) as registros_sin_identidad
from public.usage_events e
left join auth.users u on u.id = e.user_id
left join public.profiles p on p.id = e.user_id
where e.created_at >= :from and e.created_at < :to
group by 1, 2, 3
order by registros_de_uso desc;
```

Revisa el disparador y significado de `kind`: registro de cuota/intento no garantiza éxito. `extraction` puede ser automática; fotos, prewarm, `country_tasks` y resúmenes no demuestran acciones deliberadas. `assistant_message` es una señal más próxima a interacción, que tampoco demuestra utilidad o satisfacción.

Ejemplo limitado de recurrencia: identidades con registros de asistente en al menos dos días Madrid dentro de la ventana (sin tasa de retención ni identificar personas):

```sql
with actividad as (
  select user_id,
         count(distinct (created_at at time zone 'Europe/Madrid')::date) as dias
  from public.usage_events
  where created_at >= :from and created_at < :to
    and user_id is not null
    and kind = 'assistant_message'
  group by user_id
)
select count(*) as identidades_con_registros_asistente,
       count(*) filter (where dias >= 2) as identidades_con_registros_en_varios_dias
from actividad;
```

Incluye equipo hasta aplicar exclusiones verificadas. No prueba consulta pasiva del plan ni cubre otros retornos. Para una cohorte de retención hacen falta inicio observable, acción de retorno y seguimiento suficiente; con los datos actuales puede no ser medible.

## 6. Clics salientes y monetización

```sql
select coalesce(ref, '(sin ref)') as origen,
       meta->>'target' as destino,
       meta->>'affiliate' as afiliacion_declarada,
       meta->>'surface' as superficie,
       count(*) as eventos_clic
from public.funnel_events
where name = 'outbound_click'
  and at >= :from and at < :to
group by 1, 2, 3, 4
order by eventos_clic desc;
```

`partner` conserva afiliación del autor; `own` marca enlaces propios destinados a reservas adicionales. Verifica que el enlace tenga monetización activa antes de atribuir potencial de ingreso; confirma reservas y comisiones con el proveedor cuando haya datos. La etiqueta no acredita titular del cobro ni liquidación. No se puede descontar equipo de eventos sin identidad solo cruzando hora/ISP.

## 7. Vercel MCP

`get_web_analytics` con IDs de la skill. Bordes `since`/`until` en UTC.

| mode | dataset | by | Uso |
|---|---|---|---|
| aggregate | visits | `["day"]` | Serie diaria; cubrir toda la ventana/paginación |
| aggregate | visits | `["hour"]` | Serie horaria |
| aggregate | visits | `["requestPath"]` | Páginas; no volcar paths de viajes con UUID |
| aggregate | visits | `["referrerHostname"]` | Orígenes |
| aggregate | visits | `["country"]` | País |
| aggregate | visits | `["deviceType"]` | Dispositivo |
| aggregate | visits | `["hour"]` + filtro `requestPath eq '/start'` | Serie /start con consentimiento |

No sumes únicos por hora/día/path. `mode: count` dio resultados de rango inconsistentes en lecturas anteriores: valida intervalo/cobertura antes de usar un total. Si no puede validarse, informa series y «únicos del periodo no disponibles». Tampoco sumes desgloses truncados como total.

Las cifras con consentimiento y los eventos sin ese requisito tienen poblaciones/unidades distintas. No son límites matemáticos entre sí ni permiten calcular rechazo de cookies.

## 8. Llegadas frente a viajes nuevos: desajuste, no abandono del captcha

Esta comparación no enlaza sesiones. Usa ref + slug para reducir cruces entre partners, pero no corrige reutilización, slugs modificados, entradas sin evento o desfases de ventana. La normalización SQL básica no reproduce toda la decodificación/normalización Unicode del frontend; declara los casos no comparables.

```sql
with llegadas as (
  select ref, post_slug, count(*) as eventos_llegada
  from public.funnel_events
  where name = 'start_opened'
    and at >= :from and at < :to
  group by 1, 2
), viajes as (
  select referrer as ref,
         nullif(regexp_replace(
           regexp_replace(split_part(split_part(seed_source_key, '?', 1), '#', 1), '/+$', ''),
           '^.*/', ''), '') as post_slug,
         count(*) as viajes_nuevos
  from public.trips
  where seed_source_key is not null
    and created_at >= :from and created_at < :to
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
```

Conserva diferencias negativas. Sin telemetría específica, **no medible**: personas que vieron, resolvieron o abandonaron Turnstile. Los antiguos nombres `pasaron_el_gate`/`se_perdieron_en_el_gate` describían inferencias que los datos no sostienen.

## 9. Petición de cuenta: eventos por motivo

Disponible desde el despliegue del 28 ago (cobertura parcial ese día); antes, no instrumentado.

```sql
select coalesce(ref, '(sin ref)') as origen,
       count(*) filter (where name = 'start_opened') as eventos_llegada,
       count(*) filter (where name = 'gate_shown') as eventos_peticion,
       count(*) filter (where name = 'account_created') as eventos_alta
from public.funnel_events
where at >= :from and at < :to
group by 1
order by eventos_llegada desc;
```

```sql
select coalesce(ref, '(sin ref)') as origen,
       meta->>'reason' as motivo,
       count(*) as eventos_peticion
from public.funnel_events
where name = 'gate_shown'
  and at >= :from and at < :to
group by 1, 2
order by eventos_peticion desc;
```

No calcular «personas que vieron» o porcentaje de rechazo: una sesión puede emitir varios motivos y ambas tablas carecen de ID de sesión. `home` es temporizado; los demás registran una acción bloqueada. Cero equivale a cero eventos recibidos. Compara tendencias de cada motivo en ventanas y versiones comparables sin convertirlas en causas probadas.
