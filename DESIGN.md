# WanderPlanner Design System

Identidad visual limpia y tecnológica para un workspace de viaje. Referencias: [Vercel](https://vercel.com/), [OpenAI](https://openai.com), [Mindtrip](https://mindtrip.ai/), chat tipo [Claude](https://claude.ai/) para el asistente.

Fuente de verdad: este documento + tokens en `frontend/app/globals.css`.

## 1) Principios

### Quiet chrome, clear content
- UI neutra; la fotografía y los datos del viaje aportan interés.
- Sin serif editorial, sin terracota, sin papel cálido. «Papel cálido» veta textura y terracota, no el gris cálido: `--canvas` ya es `40 8% 96%` en claro y `28 7% 7%` en oscuro. Un oscuro neutro (zinc `0 0%`) sería la infracción.
- Primary = tinta neutra; el color lo ponen las fotos.

### Precisión sobre ornamentación
- Jerarquía por tamaño, peso y tracking.
- Densidad útil: cabeceras estrechas, paneles compactos.

### Tres paneles a demanda (desktop)
- Fuentes, Viaje y Asistente son paneles hermanos que se encienden/apagan desde el header.
- Se reparten el ancho a partes iguales; siempre montados (toggle = colapsar visualmente).
- Canvas gris cálido continuo; paneles `--background` redondeados sin borde duro. En oscuro el lienzo sigue siendo el suelo y los paneles suben un escalón (no se disuelven).

## 2) Color

| Token | Light | Oscuro | Uso |
|---|---|---|---|
| `--canvas` | `40 8% 96%` | `28 7% 7%` | Fondo del shell `/trips` y de las secciones tintadas |
| `--background` | `0 0% 100%` | `28 7% 10%` | Paneles / superficies (la tarjeta real) |
| `--foreground` | `0 0% 9%` | `32 12% 94%` | Texto |
| `--primary` | `20 8% 14%` | `32 12% 94%` | Tinta / CTAs |
| `--muted` / `--accent` | `0 0% 96%` | `28 6% 16%` / `18%` | Superficies sutiles; bocadillos del usuario en el chat |
| `--muted-foreground` | `0 0% 45%` | `30 6% 64%` | Meta |
| `--border` | `0 0% 90%` | `28 6% 20%` | Bordes internos suaves |
| `--radius` | `0.625rem` | `0.625rem` | Radios |

Tipos de ítem: chip neutro + punto de color (`ITEM_DOT_COLORS`). En el calendario de Ruta los badges son el mismo chip (fondo `muted`, borde neutro, punto de color, nombre truncado): nunca fondos saturados por tipo.

### Marca

Isotipo: ardilla (cola llena + cuerpo a trazo). Tinta del lockup `#86675B` (`BRAND_INK` en [`frontend/components/brand-mark.tsx`](frontend/components/brand-mark.tsx)); acento más claro `#9F8173` (`BRAND_COLOR`, velos / OG / favicon). **No es `--primary`**: el primary de UI sigue siendo tinta neutra en los dos temas; el marrón no se convierte en token de cromo (ni terracota, ni blue-600).

**Tinta de marca ≠ cromo.** La regla de arriba veta que el marrón pinte la UI: botones, bordes, superficies, estados. No veta que la **tinta del lockup** sea una variable. Que el marrón viva en `--brand-ink` (`:root` y `.dark`) en vez de en una constante de JS no lo asciende a token de cromo — sigue pintando exactamente lo mismo que pintaba, el lockup y nada más. La variable existe porque el lockup tiene dos tintas (una por tema, abajo) y porque el morph del lockup de la landing lleva tres copias en vuelo: si el color sale de estado de React en vez de CSS, pueden desincronizarse a mitad de recorrido. `BRAND_COLOR` / `BRAND_INK` siguen exportados para lo que se renderiza fuera del navegador (OG, favicon, `apple-icon`, snippet de partners), que no ve variables CSS.

- `BrandMark` — isotipo. Variantes: `color` (`--brand-ink`: marrón en claro, blanco en oscuro), `mono` (`currentColor`), `negative` (blanco sobre fondo oscuro fijo: `/partners`).
- `BrandLockup` — isotipo + wordmark «WanderPlanner»; el nombre apoya en la base del logo. Ambos en `--brand-ink`, un solo color.
- **Dos marrones en claro; negativo en oscuro.** En tema claro el wordmark es texto y necesita 4.5:1: `BRAND_INK` `#86675B` da 5.1:1 sobre blanco y 4.7:1 sobre canvas; `BRAND_COLOR` `#9F8173` no llega (3.6 / 3.3) y se queda como acento — velos, OG, `apple-icon`. En oscuro el lockup pasa a blanco (`--brand-ink: 0 0% 100%`), la misma tinta que `variant="negative"`: el marrón sobre lienzo oscuro se leía como sucio, no como marca. `BRAND_COLOR` sigue siendo el acento de velos y del glow.

  | | sobre blanco | sobre canvas claro | sobre lienzo oscuro |
  |---|---|---|---|
  | `BRAND_INK` `#86675B` | **5.1:1** | **4.7:1** | 3.7:1 |
  | `BRAND_COLOR` `#9F8173` | 3.6:1 | 3.3:1 | **5.2:1** |
  | blanco | — | — | **16:1** |

  Por eso `--brand-ink` vale `BRAND_INK` en `:root` y blanco en `.dark`. La variante `negative` (blanco literal) no cambia: es para cromo pintado a mano sobre fondo oscuro fijo (`/partners`), y en el tema oscuro de viajeros el mismo blanco sale del token.

  **En tema claro** sigue vigente: `BRAND_COLOR` no se usa como color de texto. **En oscuro** el lockup no usa ninguno de los dos marrones.
- `brandSvgMarkup()` — SVG autocontenido (snippet de partners, OG).

Los paths del componente son el original. `public/brand/logo-{color,mono,negative}.svg` son copias manuales para prensa; no las referencia el código.

## 3) Tipografía

Una sola familia: **Inter** (`--font-inter`). Sin display serif.

## 4) Layout del workspace

### Desktop
- Shell: canvas gris + sidebar colapsable (expandido / icon-rail, `wp-sidebar-collapsed`).
- Header: marca al rincón (alineada con la columna del sidebar) · colapso (`PanelLeftClose`/`PanelLeftOpen`, junto a la marca) · toggles Fuentes / Viaje / Asistente (detalle) · **Invitar** a la derecha (`UserPlus` + etiqueta). El avatar vive en el pie del sidebar.
- Tres paneles alícuota (`wp-trip-panels`); mínimo uno activo. Conmutación instantánea (sin animar `flex-grow`). Con 3 paneles y viewport &lt; ~1280px el sidebar se auto-colapsa a rail.
- Título del viaje en la cabecera del panel Viaje (no en el header). Los avatares de quienes comparten el viaje van en las cards de Inicio.
- Columna de contenido `.panel-column` (`max-w-4xl`) en Fuentes y Mi viaje. Fuentes: pestañas con subrayado (`PanelTabs`). Mi viaje y Lista · Calendario · Mapa: píldora (`SegmentedControl`). Etiquetas según ancho del **panel** (`@container` / `@md:` ≈448px), no de la ventana.
- Sidebar: «Inicio» y «Tus viajes» como filas hermanas; pie de cuenta (avatar + nombre expandido, solo avatar en rail).
- Asistente: panel peer montado desde el inicio; chips de sugerencia sin esperar a Supabase si no hay conversación activa.

### Móvil
- **Sin** título de viaje en header de detalle (marca + icono Invitar a la izquierda del avatar).
- Nav inferior de tres secciones (`TripMobileNav`): Fuentes · Mi viaje · Asistente. Dock de cristal (`.wp-glass`): en claro, velo cálido y blur largo; en oscuro, humo (`alpha` ~0.22, blur corto, saturación ~1) — no el mismo velo blanco saturado. Pestañas inactivas en `--wp-nav-ink` (marrón en claro, gris `muted` en oscuro).
- Cabeceras que se colapsan al scroll; composer ajustado al teclado virtual.
- «Añadir fuente» desde chips / sheet en Fuentes.

### Chat del asistente
- Mensajes del **usuario**: bocadillo alineado a la derecha, fondo `muted`.
- Mensajes del **asistente**: sin caja ni borde; texto a ancho del panel.
- Scroll: al enviar, la pregunta queda anclada arriba; auto-follow solo si el usuario está al fondo.
- Enlaces del chat: clicables, sin botón «Añadir fuente». Citar el origen de un dato ≠ indexar el artículo. Añadir una fuente va por `propose_add_source` (tarjeta) o por el panel Fuentes.

### Home de viajes
- Home de viajes: portada en cada tarjeta + Archivar / Editar / Eliminar. Tarjetas de invitación pendiente (Aceptar / Rechazar). El editor no ve Archivar ni Eliminar; ve «Salir del viaje». Badges «Compartido» / «De [nombre]» si aplica.
- Mientras se cargan los viajes desde Supabase, el bloque muestra un spinner en el mismo contenedor punteado que el empty state (nunca «No hay viajes activos» de forma prematura).

### Superficie de marketing (landing)

`/` es una página de marketing, no una superficie de cuenta. Vive en [`frontend/components/landing/`](frontend/components/landing/) y **no comparte** el cromo de login. Ese lenguaje es solo de marketing: el workspace sigue siendo quiet chrome y no adopta glows, textura de grid ni display type.

- Escala display (solo aquí): h1 `text-[2.75rem] sm:text-6xl lg:text-7xl` con `leading-[1.05]` y tracking `[-0.035em]`; h2 de sección `text-3xl sm:text-4xl lg:text-5xl` / `[-0.03em]`; eyebrow `text-[11px] sm:text-xs` uppercase con tracking `[0.14em] sm:[0.18em]` (a 375px, con `text-xs` + `0.18em` el antetítulo parte y deja una palabra huérfana). Titulares de valor a dos tonos: segunda línea en `text-foreground/45`.
- Textura `.landing-grid-texture` (grid 56px que se desvanece) y velo de marca (`--landing-brand-veil`: `BRAND_COLOR` al 8 % en claro, al 18 % en oscuro — un 8 % sobre lienzo casi negro no se ve). **Es un bookend**: solo hero y variante `--flip` en `ClosingCta`. No a media página.
- Pieza central del hero: workspace de 3 paneles en un marco de navegador, con glow de las 4 tintas de ítem (`--landing-item-glow`: `-600` / alfa alta en claro, `-400` / alfa baja + marca al centro en oscuro). El panel «Mi viaje» corta su último ítem con un degradado (`mask-image`): el corte tiene que leerse como «sigue», no como recorte.
- Tras el hero, tres zooms de valor ([`value-props.tsx`](frontend/components/landing/value-props.tsx)): **diagrama** (artículo → ítems) · **panel** (Mi viaje + coste) · **conversación** (asistente + Básicos). Siluetas distintas a propósito; no tres bloques calcados. Eyebrow con punto `sky-600` / `orange-600` / `violet-600` (en oscuro, los `-400` de `ITEM_DOT_COLORS`).
- Arranque del hero: cápsula de chips (`LandingStart`) — **Pega un artículo** · **Busca un destino** · **Crea tu cuenta**. Chip activo = `bg-foreground text-background` sobre cápsula `bg-background` (se invierte con el tema). El panel bajo los chips tiene altura reservada; resultados y el registro compacto van en un popover que solapa el mockup, no en flujo.
- Mockups del producto: reconstrucciones HTML, nunca capturas, y **no inventan UI que el producto no tiene** (citas en prosa, no chips de fuente). Viaje ficticio «Vietnam en 12 días» y atribución genérica `vía @unblogdeviajes` — nunca un partner real. Átomos en [`landing-mocks.tsx`](frontend/components/landing/landing-mocks.tsx). El interior es token puro (`tone="light"`): claros en tema claro, oscuros en tema oscuro. El marco sube a `--background` en oscuro (un filo, no una sombra). Las fotos falsas se quedan claras, con `.landing-mock-photo` al 92 % como la Crónica.
- El CTA de blogueros de `/` es un enlace del footer a `/partners`. No hay banda oscura a media página en la landing de viajeros.
- **`/partners` es la landing en negativo** de esa tinta: misma arquitectura (hero + 3 zooms + CTA + footer), cromo `tone="negative"`. El hero genera el botón (`id="empezar"`); el marco es un post de blog con el CTA real. El snippet del kit tiene formato CTA o Banner, cada uno en `color` (`#9F8173` sobre `#E8E5E4`) y `negative` (blanco sobre negro / degradado). Los zooms son las garantías (atribución, afiliación, pestaña nueva + hosting), no el producto del viajero. Botón primario blanco; `--ring` blanco bajo `.landing-negative`. Los mockups de `/partners` van en **cromo negativo** (superficie `hsl(20 8% 14%)`, bordes `white/10`); los de `/` **siguen los tokens** (claros u oscuros según `wp-theme`). `tone="negative"` no es el eje claro/oscuro: reutilizarlo para el tema oscuro de viajeros mete la tinta de partners y deja los mocks sordos a la paleta. La página fuerza `forcedTheme="light"` para que `.dark` no rompa el negativo. No redefinir `--canvas` en el wrapper. JS extra: el generador (`PartnerButtonBuilder`) y Turnstile `theme="dark"`. Sin píldora de apariencia en su footer.
- Reveal por scroll (`.landing-reveal`) solo con `animation-timeline: view()`; apagado si `prefers-reduced-motion`.
- Cero JS de landing salvo el morph del logo (`LandingLockup`), los chips de arranque (`LandingStart`) y la píldora de apariencia (`ThemeModeToggle`). En `/partners`, además el generador del botón.

### Superficies de cuenta
- `/login`, `/signup`, `/forgot-password` y `/reset-password` comparten cromo propio, sin sidebar: marca arriba, una columna centrada (`max-w-md`) y **el mismo fondo que la landing `/`**: canvas cálido + `.landing-grid-texture` + velo de marca. Siguen `wp-theme` (no se fuerzan a claro): forzarlos daría un fogonazo al salir de una app oscura, y rompería la continuidad que ya se arregló al quitar el radial azul. Antes había aquí un radial `hsl(221 83% 53%)` — blue-600, prohibido más abajo — que además enfriaba el embudo justo al salir de `/`. `/account` (perfil) y `/account/settings` (email, contraseña, borrar cuenta) viven en el shell de `/trips` (header + sidebar + canvas). `/partners` ya no usa `AuthShell`.
- Menú de cuenta (nombre, email, Perfil, Configuración, Apariencia, cerrar sesión): pie del sidebar en desktop; cabecera en móvil. Apariencia es un submenú (Claro / Oscuro / Sistema) y está también para invitados: es preferencia de pantalla, no de cuenta. La misma clave `wp-theme` la pinta la píldora del footer de las landings de viajeros.
- Invitados (sesión anónima): el avatar muestra «Estás probando sin cuenta» y ofrecen guardar el viaje en lugar de Perfil / Configuración.
- `RegistrationGate`: modal breve (nombre, email, contraseña dos veces) con copy propio según el motivo — segunda fuente, nuevo viaje o ir a inicio. Recuperación de contraseña en `/forgot-password` → `/reset-password`.

## 5) Qué no hacer

- No reintroducir Fraunces, brand turquesa, primary blue-600 ni primary terracota.
- No volver al asistente overlay / FAB en desktop ni a `react-resizable-panels` para el detalle.
- No reintroducir breadcrumb de viaje ni nav inferior en desktop.
- No envolver las respuestas del asistente en cards con borde/sombra.
- No ofrecer «Añadir fuente» sobre taquillas, webs oficiales de una atracción u OTAs como si fueran blogs de inspiración. El chat cita enlaces; indexar un artículo es `propose_add_source` o el panel Fuentes.
- No bloquear al invitado antes de que vea valor: la primera fuente del CTA entra sin cuenta; la puerta salta en la segunda fuente, al crear otro viaje o al ir a inicio.
- No desmontar paneles desktop al apagarlos (se pierde scroll / Crónica / borrador del composer).
- No decidir el tema en JavaScript. El servidor no lo sabe (hidratación), en `/trips/[tripId]` un consumidor nuevo se re-renderiza en cada mutación, y el morph del lockup de la landing lleva tres copias en vuelo. Solo cuatro superficies hablan con un motor ajeno: Sonner, Turnstile, Mapbox y `<meta name="theme-color">`.
- No usar `tone="negative"` para el tema oscuro de los mocks de viajeros. `tone` es el eje de marca (viajeros ↔ partners); el oscuro viaja por la rama `light`, que lee tokens.
- No dar por buena una pareja de color sin medirla. `test:theme-contrast` en CI es la red (4.5:1 texto, escalera `canvas < background < popover` en los dos temas).
