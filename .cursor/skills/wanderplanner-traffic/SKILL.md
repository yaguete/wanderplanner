---
name: wanderplanner-traffic
description: >-
  Analiza tráfico, uso, registros y afiliación de WanderPlanner con Supabase y
  Vercel Analytics; distingue eventos, cuentas y personas, y documenta la lectura
  en el seguimiento del vault. Usar para revisar visitas, embudo, invitados,
  gate_shown, clics salientes, retorno o el criterio de vida de wanderplanner.ai.
---

# WanderPlanner · seguimiento de tráfico

Responde en español a qué actividad se ha observado, qué evidencia hay de uso externo y qué falta para valorar el negocio. Separa hechos, inferencias y desconocidos. Una lectura pequeña o incompleta no identifica por sí sola el cuello de botella.

## Alcance y fuentes

Ventana por defecto: **ayer, Europe/Madrid**, intervalo semiabierto `[desde, hasta)`. Anota ambos límites y la fecha de consulta; convierte los bordes a UTC para Vercel respetando el horario de verano. Separa cualquier dato de hoy o acumulado.

| Servicio | Identificador |
|---|---|
| Supabase · WanderPlanner | `kzriijgdkrdruikmpufl` |
| Vercel team | `team_f9DR86W9nckEuIvwthX0w5V3` |
| Vercel project | `prj_zA8P8kqF1z6mdrScwsydI6dyKyGC` |

Descubre las herramientas disponibles de Supabase (`execute_sql`) y Vercel (`get_web_analytics`); no supongas nombres de MCP de otra instalación. No uses `va-cross-prototype`. Si falta acceso, informa del límite y trabaja con la última lectura fechada sin presentarla como consulta nueva.

Lee [queries.md](queries.md) para las consultas. Contrasta cambios de instrumentación en `frontend/lib/funnel-analytics.ts`, sus puntos de emisión, `backend/funnel.py` y `frontend/lib/auth-context.tsx`. `supabase/queries/funnel.sql` es un apoyo; usa ventanas explícitas para informes reproducibles.

Esta skill hace lecturas de los servicios y escribe la nota. No cambia instrumentación, cuentas, datos de producción, despliegues ni contactos. Una revisión de la propia skill no implica ejecutar una lectura nueva de producción.

## Registro en el vault

Ruta:
`/Users/yago/Library/Mobile Documents/iCloud~md~obsidian/Documents/notas_de_yago/🚀 Personal/🚧 Pet Projects/WanderPlanner/WanderPlanner-embudo-seguimiento.md`

Antes de escribir, lee el estado actual. Al terminar una lectura:

- Añade una fila a `## Registro` con fecha, ventana, unidades y cobertura; y una entrada fechada en `## Lecturas del embudo (texto libre)`.
- Distingue una consulta nueva de una revisión metodológica. Esta última usa «sin consulta nueva», nunca ceros como si fueran métricas del día.
- Conserva los números históricos y su procedencia. Si una interpretación es falsa, corrígela con fecha y motivo; no la mantengas como conclusión vigente por una regla de historial inmutable. Un recuento nuevo sustituye el estado actual solo con evidencia y fecha, dejando rastro del anterior.
- Actualiza el reloj y el acumulado por separado: el paso del tiempo no refresca los datos de Authentication.
- Si falta una lectura, escribe «no consta aquí»; no concluyas que nadie consultó el embudo. Busca las notas pertinentes si hace falta. Si falta el fichero, comunica el límite; no inventes historial.

## Qué mide cada capa

| Capa | Unidad y límites |
|---|---|
| `funnel_events` | Eventos recibidos por el servidor; no tiene `user_id`, IP ni identificador de sesión. Cuatro nombres actuales: `start_opened`, `gate_shown`, `account_created`, `outbound_click`. Retención prevista: 90 días. |
| Vercel Analytics | Páginas y visitantes según su definición, solo con `wp-consent=all` en la integración actual. No representa todo el tráfico ni identifica personas. |
| Auth / producto | Identidades técnicas, viajes, fuentes, solicitudes de uso y caché. Muchas filas se crean o actualizan automáticamente. |

Los eventos custom de Vercel devolvían 402 en el plan documentado. No repitas esa consulta en la rutina salvo que cambie el plan o el usuario pida comprobarlo. No confundir falta de acceso con cero eventos.

### Unidades, atribución y comparaciones

- `start_opened`: guarda en `sessionStorage` por **ref + postSlug**, durante la sesión de pestaña. Puede repetirse entre pestañas, dispositivos o al fallar el almacenamiento; puede no llegar por un fallo de red. Ocurre antes de resolver Turnstile, pero después de las condiciones de carga/configuración del frontend. No equivale a personas únicas ni a impresiones/clics del banner.
- `gate_shown`: guarda por **motivo** en esa sesión, no por artículo. Una sesión puede emitir varios motivos; el mismo motivo posterior en otro artículo puede no emitirse. Por tanto, sumar motivos no cuenta personas y dividir gates por starts no produce una tasa de exposición de una cohorte.
- `account_created`: evento del flujo del frontend, no censo ni garantía de email confirmado. No atribuyas automáticamente un alta a una llegada concreta porque compartan artículo/hora.
- `outbound_click`: clic registrado, repetible; no reserva ni ingreso.
- `ref` y `post_slug` son atribución, no identidad. `wp-landing`, `wp-sources`, `landing`, `start`, `admin` son orígenes internos, **no prueban tráfico del equipo**.
- Los CTA específicos documentados en `WanderPlanner-plan-produccion` transmiten `source`; el banner genérico abre la landing del partner. Usa la lista vigente al revisar el recorrido. `ref + post_slug` no siempre permite distinguirlos: la landing puede conservar atribución previa y su buscador acabar en el mismo artículo. Si falta la superficie de entrada, declara que no se puede separar.
- Puedes mostrar altas/start como **ratio de eventos**, con misma ventana y filtro y denominador explícito; no lo llames conversión de personas. Muestra n/d y advierte si no hay cohorte enlazable.
- No sumes ventanas móviles solapadas ni visitantes únicos por hora/día para obtener únicos del periodo. No compares acumulados con periodos parciales como si tuvieran igual duración. Una fila de total es válida solo si el proveedor devuelve ese total para la ventana.
- Vercel y Auth/funnel tienen cobertura y unidades distintas: no impongas `Analytics ≤ actividad real` ni `start_opened ≥ /start`, ni calcules un «porcentaje sin consentimiento» restándolos.

### Identidades y contaminación

Mantén tres grupos: **equipo/pruebas confirmadas**, **externos confirmados**, **desconocidos**. Para cada clasificación indica evidencia y fecha. Los indicios pueden anotarse dentro de desconocidos; no los conviertas en un censo.

Una cuenta reconocida por Yago o una prueba documentada permiten excluir actividad vinculable a esa identidad técnica. `signup_referrer=SinMapa` es una pista histórica de la cuenta del fundador: valida la correspondencia, no conviertas todo un ref público en una lista de exclusión.

Una IP o red coincidente, ISP residencial, datacenter, país, ausencia de sesión, nombre de destino o proximidad horaria **no bastan** para afirmar equipo, persona externa o bot. Tampoco permiten unir dos cuentas como una persona. La ausencia de una fila en `auth.sessions` no prueba que nunca hubiera una sesión.

No arrastres cifras fijas ni nombres de lectores desde esta skill. Consulta el último estado documentado y su evidencia. Sin datos nuevos, conserva la última cifra como **clasificación histórica pendiente de validar** cuando solo se apoye en redes. Una cuenta borrada cambia el censo actual; no demuestra que su alta histórica fuera falsa o interna.

Prueba conocida del 5 sep: `ref=codex-audit`, artículo Rocosas, viaje `d7b130f3-ad4e-4107-8895-ebd33838d173`. Exclúyela donde haya vínculo verificable; las visitas previas al blog/landing del auditor no están todas etiquetadas. No restes eventos anónimos por coincidencia horaria.

### Progreso técnico, uso y retorno

| Observación | Interpretación admisible |
|---|---|
| Viaje con fuente inicial | El flujo creó/persistió un borrador; no demuestra planificación deliberada. |
| Extracción o fuente creada | Procesamiento o incorporación de contenido, posiblemente automática/prewarm. |
| `updated_at` posterior | Hubo una escritura; puede ser sync, metadatos o importación. No demuestra una edición humana. |
| `created_at = updated_at` | No consta escritura posterior en esa fila; no demuestra rebote ni ausencia de lectura. |
| Solicitud al asistente u otra acción vinculable | Señal de interacción; revisa qué la dispara y si el registro mide intento, éxito o consumo. |
| Actividad de la misma identidad en otro día | Retorno de identidad técnica si hay registros fechados comparables; no por compartir /24 o post. Describe la acción, no declares retención útil solo por login/refresh. |

La activación útil propuesta es obtener un borrador utilizable y tomar una decisión propia recuperable. Si la instrumentación no permite observarlo, escribe **«activación útil no medible con estos datos»**, además de las señales disponibles. No inventes una tasa ni una nueva métrica registrada.

`fetched_at` de `article_extractions` se sobrescribe en el upsert: indica extracción reciente, **no primera indexación histórica**. `validated_at` es validación. Para probar novedad hacen falta historial/snapshot anterior; contar fetches tampoco cuenta URLs distintas.

### Captcha y petición de cuenta

La diferencia entre `start_opened` y viajes nuevos por artículo es un **desajuste entre agregados**, no abandonos del captcha. Reutilización, cambios de seed, ventanas, ref, slugs, pérdidas de eventos y fallos de auth/persistencia pueden alterarlo; puede ser negativo. Ni siquiera es una cota estadística garantizada sin supuestos verificables. No recortes negativos a cero para construir un porcentaje de abandono.

Sin telemetría específica no sabes quién vio, resolvió o abandonó Turnstile. Una reproducción del navegador confirma solo ese caso.

`gate_shown` es el registro, no Turnstile. Disponible desde el despliegue del **28 ago 2026**: ese día puede tener cobertura parcial; antes, «no instrumentado». Cero después significa cero eventos recibidos, no prueba de que nadie viera la modal.

- `home`: recordatorio temporizado (3 minutos, luego 5); no acción voluntaria.
- Otros motivos actuales: `new-trip`, `second-source`, `source-limit`, `assistant-limit`, `invite`, `share-plan`. Señalan una acción bloqueada, no que se completara, aceptara pagar o rechazara conscientemente registrarse.
- Usa los motivos de los enums actuales. Presenta eventos por motivo; no personas expuestas/rechazos individuales sin vínculo.

### Criterio de vida y fechas de cuenta

Regla histórica documentada: **10 emails externos recogidos en cuatro semanas**, desde **17 ago 2026**, vence **14 sep 2026**. Es una regla de decisión del fundador, no validación estadística del mercado; no declares fracaso definitivo antes del plazo.

Expresa días transcurridos desde el 17 (día 0) y restantes, evitando mezclar numeraciones inclusivas. No cambies el umbral ni exijas confirmación/retorno como criterio adicional sin decisión de Yago; informa esas condiciones aparte.

Authentication es fuente del **estado actual**, no un historial completo de altas: `auth.users.created_at` puede ser la creación del invitado que luego se convierte con `updateUser`. No cuenta todos los upgrades de la ventana. `email_confirmed_at` acredita estado/fecha de confirmación, no necesariamente el clic del email ni fecha de registro; `updated_at` tampoco es fecha de conversión.

Reporta por separado: censo actual con email, confirmadas, identidades creadas en ventana, confirmaciones en ventana y eventos `account_created`. Cruza la clasificación equipo/externos/desconocidos solo donde sea verificable. Un registro sin sesión o con origen interno no se descarta automáticamente. Sin historial fiable no reconstruyas la fecha exacta de conversión ni borres del histórico cuentas eliminadas.

### Afiliación: la hipótesis que se está probando

El bloguero conserva sus enlaces. WanderPlanner pretende ingresar con **reservas adicionales fuera de esos enlaces**, añadidas manualmente o aceptadas del asistente; también puede ofrecer buscadores en elementos sin enlace de afiliación. El viajero no tiene que pagar a WanderPlanner para validar esta hipótesis.

Separa: uso útil → necesidad adicional → clic a enlace propio monetizable → reserva atribuida → comisión liquidada. Los datos actuales solo cubren parte de esa cadena. Desglosa `target × affiliate × surface`, manteniendo equipo/pruebas y desconocidos cuando se puedan distinguir. `affiliate=own` es una clasificación del código; comprueba identificador/cuenta receptora si se evalúan ingresos. No todos los enlaces propios están necesariamente monetizados; vuelos tenía el identificador vacío en la revisión del 5 sep.

No sustituyas este modelo por cobro al viajero o tarifa al bloguero salvo que el usuario pida explorar alternativas. No equipares clics partner a ingreso de WanderPlanner ni clics own a comisiones cobradas. Para cobertura de costes usa comisiones netas liquidadas y supuestos explícitos cuando aún no existan.

## Privacidad

Consulta agregados y booleanos; no vuelques emails, nombres de lectores, IPs completas, user-agents, UUIDs de usuarios ni contenido libre de viajes/chats. Los IDs pueden usarse internamente en joins sin devolverlos. Usa alias de casos solo cuando hagan falta y sean consistentes; no enlaces actividad de `funnel_events` a esos alias por intuición.

No pidas redes por defecto. Si son necesarias para una hipótesis concreta, devuelve `network(set_masklen(ip, 24))` para IPv4 (prefijo amplio para IPv6); **`set_masklen` solo no elimina los bits del host**. Las redes siguen siendo indicios, no anonimato garantizado. Limita metadatos a claves permitidas y sanitiza las URLs antes de devolverlas. Si una consulta es bloqueada, reduce campos a lo necesario; no intentes obtener el mismo dato sensible por otra ruta.

## Ejecución y entrega

1. Lee el último seguimiento y fija ventana, procedencia y exclusiones demostrables.
2. Consulta en paralelo las piezas independientes necesarias con [queries.md](queries.md). Verifica rango/cobertura de Vercel; si no da únicos de periodo, informa la serie sin sumar únicos.
3. Comprueba unidades, joins, automatismos y clasificación antes de inferir causas. Los cruces por post/hora sirven para hipótesis, no para identificar personas.
4. Escribe una lectura breve: **hechos / interpretación / desconocidos / siguiente comprobación útil**. Incluye eventos CTA y motivos de registro, señales de producto, censo, clics propios/partner y comisiones si se conocen. Omite bloques vacíos irrelevantes, distingue «0 observado» de «no consultado».
5. Guarda el resultado y enlaza la nota. Si corriges una lectura, señala qué cambió sin simular una nueva consulta.

Ejemplo de conclusión proporcionada: «Se registraron 3 llegadas y ningún viaje nuevo en esa ventana. No podemos atribuir esa diferencia al captcha ni saber cuántas personas eran. Las dos cuentas pendientes siguen sin clasificación suficiente».
