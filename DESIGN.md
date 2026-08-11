# WanderPlanner Design System

Identidad visual limpia y tecnológica para un workspace de viaje. Referencias: [Vercel](https://vercel.com/), [OpenAI](https://openai.com), [Mindtrip](https://mindtrip.ai/), chat tipo [Claude](https://claude.ai/) para el asistente.

Fuente de verdad: este documento + tokens en `frontend/app/globals.css`.

## 1) Principios

### Quiet chrome, clear content
- UI neutra; la fotografía y los datos del viaje aportan interés.
- Sin serif editorial, sin terracota, sin papel cálido.
- Primary = tinta neutra; el color lo ponen las fotos.

### Precisión sobre ornamentación
- Jerarquía por tamaño, peso y tracking.
- Densidad útil: cabeceras estrechas, paneles compactos.

### Tres paneles a demanda (desktop)
- Fuentes, Viaje y Asistente son paneles hermanos que se encienden/apagan desde el header.
- Se reparten el ancho a partes iguales; siempre montados (toggle = colapsar visualmente).
- Canvas gris cálido continuo; paneles blancos redondeados sin borde duro.

## 2) Color

| Token | Light | Uso |
|---|---|---|
| `--canvas` | `40 8% 96%` | Fondo del shell `/trips` |
| `--background` | `0 0% 100%` | Paneles / superficies |
| `--foreground` | `0 0% 9%` | Texto |
| `--primary` | `20 8% 14%` | Tinta / CTAs |
| `--muted` / `--accent` | `0 0% 96%` | Superficies sutiles; bocadillos del usuario en el chat |
| `--muted-foreground` | `0 0% 45%` | Meta |
| `--border` | `0 0% 90%` | Bordes internos suaves |
| `--radius` | `0.625rem` | Radios |

Tipos de ítem: chip neutro + punto de color (`ITEM_COLORS.dot`).

## 3) Tipografía

Una sola familia: **Inter** (`--font-inter`). Sin display serif.

## 4) Layout del workspace

### Desktop
- Shell: canvas gris + sidebar colapsable (expandido / icon-rail, `wp-sidebar-collapsed`).
- Header: marca al rincón (alineada con la columna del sidebar) · toggles Fuentes / Viaje / Asistente (detalle) · avatar.
- Tres paneles alícuota (`wp-trip-panels`); mínimo uno activo. Conmutación instantánea (sin animar `flex-grow`). Con 3 paneles y viewport &lt; ~1280px el sidebar se auto-colapsa a rail.
- Título del viaje en la cabecera del panel Viaje (no en el header).
- Columna de contenido `.panel-column` (`max-w-4xl`) en Fuentes y Mi viaje. Fuentes: pestañas con subrayado (`PanelTabs`). Mi viaje y Lista/Mapa: píldora (`SegmentedControl`). Etiquetas según ancho del **panel** (`@container` / `@md:` ≈448px), no de la ventana.
- Sidebar: colapsar con `PanelLeftClose`/`PanelLeftOpen` en el pie; «Inicio» y «Tus viajes» como filas hermanas.
- Asistente: panel peer montado desde el inicio; chips de sugerencia sin esperar a Supabase si no hay conversación activa.

### Móvil
- **Sin** título de viaje en header de detalle (marca + avatar).
- Nav inferior de tres secciones (`TripMobileNav`): Fuentes · Mi viaje · Asistente.
- Cabeceras que se colapsan al scroll; composer ajustado al teclado virtual.
- «Añadir fuente» desde chips / sheet en Fuentes.

### Chat del asistente
- Mensajes del **usuario**: bocadillo alineado a la derecha, fondo `muted`.
- Mensajes del **asistente**: sin caja ni borde; texto a ancho del panel.
- Scroll: al enviar, la pregunta queda anclada arriba; auto-follow solo si el usuario está al fondo.
- Enlaces institucionales: clicables, sin botón «Añadir fuente».

### Home de viajes
- Tarjetas/lista con portada fotográfica (`coverUrl`) o emoji; acciones Archivar / Editar / Eliminar a primer nivel.
- Mientras se cargan los viajes desde Supabase, el bloque muestra un spinner en el mismo contenedor punteado que el empty state (nunca «No hay viajes activos» de forma prematura).

### Superficies de cuenta
- `/` (landing placeholder), `/login`, `/signup`, `/partners` y `/account` comparten cromo propio, sin sidebar: marca arriba, una columna centrada (`max-w-md`, o `max-w-2xl` en `/partners`) y fondo con un degradado radial tenue.
- Avatar de la cabecera: menú (nombre, email, ajustes, cerrar sesión) en desktop y móvil.
- Invitados (sesión anónima): el avatar muestra «Estás probando sin cuenta» y ofrecen guardar el viaje en lugar de ajustes.
- `RegistrationGate`: modal breve (nombre, email, contraseña, o enlace de confirmación vía `updateUser` sobre la misma sesión anónima) con copy propio según el motivo — segunda fuente, nuevo viaje o ir a inicio.

## 5) Qué no hacer

- No reintroducir Fraunces, brand turquesa, primary blue-600 ni primary terracota.
- No volver al asistente overlay / FAB en desktop ni a `react-resizable-panels` para el detalle.
- No reintroducir breadcrumb de viaje ni nav inferior en desktop.
- No envolver las respuestas del asistente en cards con borde/sombra.
- No ofrecer «Añadir fuente» sobre webs gubernamentales / de visados como si fueran blogs de inspiración.
- No bloquear al invitado antes de que vea valor: la primera fuente del CTA entra sin cuenta; la puerta salta en la segunda fuente, al crear otro viaje o al ir a inicio.
- No desmontar paneles desktop al apagarlos (se pierde scroll / Crónica / borrador del composer).
