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

### Marca

Isotipo: ardilla (cola llena + cuerpo a trazo). Tinta del lockup `#86675B` (`BRAND_INK` en [`frontend/components/brand-mark.tsx`](frontend/components/brand-mark.tsx)); acento más claro `#9F8173` (`BRAND_COLOR`, velos / OG / favicon). **No es `--primary`**: el primary de UI sigue siendo tinta `20 8% 14%`; el marrón no se convierte en token de cromo (ni terracota, ni blue-600).

- `BrandMark` — isotipo. Variantes: `color` (`BRAND_INK`, cromo claro), `mono` (`currentColor`), `negative` (blanco sobre fondo oscuro).
- `BrandLockup` — isotipo + wordmark «WanderPlanner»; el nombre apoya en la base del logo. Ambos en `BRAND_INK` para un solo marrón.
- **Dos marrones.** El lockup (isotipo + wordmark) usa `BRAND_INK` `#86675B`: el wordmark es texto y necesita 4.5:1, que `BRAND_COLOR` `#9F8173` no da (3.6:1 sobre blanco, 3.3:1 sobre canvas). Con tinta: 5.1:1 y 4.7:1. `BRAND_COLOR` queda para acentos (velos, OG, apple-icon). No uses `BRAND_COLOR` como color de texto en cabeceras.
- `brandSvgMarkup()` — SVG autocontenido (snippet de partners, OG).

Los paths del componente son el original. `public/brand/logo-{color,mono,negative}.svg` son copias manuales para prensa; no las referencia el código.

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

### Superficie de marketing (landing)

`/` es una página de marketing, no una superficie de cuenta. Vive en [`frontend/components/landing/`](frontend/components/landing/) y **no comparte** el cromo de login. Ese lenguaje es solo de marketing: el workspace sigue siendo quiet chrome y no adopta glows, textura de grid ni display type.

- Escala display (solo aquí): h1 `text-[2.75rem] sm:text-6xl lg:text-7xl` con `leading-[1.05]` y tracking `[-0.035em]`; h2 de sección `text-3xl sm:text-4xl lg:text-5xl` / `[-0.03em]`; eyebrow `text-[11px] sm:text-xs` uppercase con tracking `[0.14em] sm:[0.18em]` (a 375px, con `text-xs` + `0.18em` el antetítulo parte y deja una palabra huérfana). Titulares de valor a dos tonos: segunda línea en `text-foreground/45`.
- Textura `.landing-grid-texture` (grid 56px que se desvanece) y velo de marca `#9F8173` ≤ 8% de opacidad. **Es un bookend**: solo hero y variante `--flip` en `ClosingCta`. No a media página.
- Pieza central del hero: workspace de 3 paneles en un marco de navegador, con glow de las 4 tintas de ítem (`sky-600`, `orange-600`, `emerald-600`, `violet-600`). El panel «Mi viaje» corta su último ítem con un degradado (`mask-image`): el corte tiene que leerse como «sigue», no como recorte.
- Tras el hero, tres zooms de valor ([`value-props.tsx`](frontend/components/landing/value-props.tsx)): **diagrama** (artículo → ítems) · **panel** (Mi viaje + coste) · **conversación** (asistente + Básicos). Siluetas distintas a propósito; no tres bloques calcados. Eyebrow con punto `sky-600` / `orange-600` / `violet-600`.
- Arranque del hero: cápsula de chips (`LandingStart`) — **Pega un artículo** · **Busca un destino** · **Crea tu cuenta**. Chip activo = píldora negra sobre cápsula blanca. El panel bajo los chips tiene altura reservada; resultados y el registro compacto van en un popover que solapa el mockup, no en flujo.
- Mockups del producto: reconstrucciones HTML, nunca capturas, y **no inventan UI que el producto no tiene** (citas en prosa, no chips de fuente). Viaje ficticio «Vietnam en 12 días» y atribución genérica `vía @unblogdeviajes` — nunca un partner real. Átomos en [`landing-mocks.tsx`](frontend/components/landing/landing-mocks.tsx).
- Banda de blogueros sobre tinta `hsl(20 8% 11%)` (un paso más profunda que `--primary`), texto blanco.
- **`/partners` es la landing en negativo** de esa tinta: misma arquitectura (hero + 3 zooms + CTA + footer), cromo `tone="negative"`. El hero genera el botón (`id="empezar"`); el marco es un post de blog con el CTA real. El snippet del kit tiene formato CTA o Banner, cada uno en `color` (`#9F8173` sobre `#E8E5E4`) y `negative` (blanco sobre negro / degradado). Los zooms son las garantías (atribución, afiliación, pestaña nueva + hosting), no el producto del viajero. Botón primario blanco; `--ring` blanco bajo `.landing-negative`. Los mockups de `/partners` van en **cromo negativo** (superficie `hsl(20 8% 14%)`, bordes `white/10`); los de `/` siguen claros. No redefinir `--canvas` en el wrapper. JS extra: el generador (`PartnerButtonBuilder`) y Turnstile `theme="dark"`.
- Reveal por scroll (`.landing-reveal`) solo con `animation-timeline: view()`; apagado si `prefers-reduced-motion`.
- Cero JS de landing salvo el morph del logo (`LandingLockup`) y los chips de arranque (`LandingStart`). En `/partners`, además el generador del botón.

### Superficies de cuenta
- `/login`, `/signup` y `/account` comparten cromo propio, sin sidebar: marca arriba, una columna centrada (`max-w-md`) y **el mismo fondo que la landing `/`**: canvas cálido + `.landing-grid-texture` + velo de marca al 8%. Antes había aquí un radial `hsl(221 83% 53%)` — blue-600, prohibido más abajo — que además enfriaba el embudo justo al salir de `/`. `/partners` ya no usa `AuthShell`.
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
