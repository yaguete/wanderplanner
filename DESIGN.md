# WanderPlanner Design System

Identidad visual limpia y tecnológica para un workspace de viaje. Referencias: [Vercel](https://vercel.com/), [OpenAI](https://openai.com), [Mindtrip](https://mindtrip.ai/), chat tipo [Claude](https://claude.ai/) para el asistente.

Fuente de verdad: este documento + tokens en `frontend/app/globals.css`.

## 1) Principios

### Quiet chrome, clear content
- UI neutra; la fotografía y los datos del viaje aportan interés.
- Sin serif editorial, sin terracota, sin papel cálido.

### Precisión sobre ornamentación
- Jerarquía por tamaño, peso y tracking.
- Densidad útil: cabeceras estrechas, paneles compactos.

### Fuentes primero, plan a demanda
- Las fuentes ocupan el canvas principal.
- «Mi viaje» es un panel overlay derecho ocultable.
- El asistente es otro overlay (mismo footprint ~560px en desktop).

## 2) Color

| Token | Light | Uso |
|---|---|---|
| `--background` | `0 0% 100%` | Canvas |
| `--foreground` | `0 0% 9%` | Texto |
| `--primary` | `221 83% 53%` | Énfasis / CTAs (azul eléctrico) |
| `--muted` / `--accent` | `0 0% 96%` | Superficies sutiles; bocadillos del usuario en el chat |
| `--muted-foreground` | `0 0% 45%` | Meta |
| `--border` | `0 0% 90%` | Bordes |
| `--radius` | `0.625rem` | Radios |

Tipos de ítem: chip neutro + punto de color (`ITEM_COLORS.dot`).

## 3) Tipografía

Una sola familia: **Inter** (`--font-inter`). Sin display serif.

## 4) Layout del workspace

### Desktop
- Breadcrumb de viaje ~44px (`TripBreadcrumb`): nombre, meta, «Añadir fuente», «Mi viaje».
- Fuentes a ancho completo.
- «Mi viaje»: overlay derecho ~560px, persistencia de abierto/cerrado en `localStorage`.
- Asistente: overlay hermano (mismo ancho); FAB «Asistente» abajo a la derecha (se desplaza si el plan está abierto).

### Móvil
- **Sin** breadcrumb (gana altura útil).
- FABs abajo a la derecha, solo iconos: **+** (fuente), **asistente**, **Mi viaje** (activo = primary; abierto = gris + icono de cierre). Se ocultan cuando el asistente está abierto; permanecen con «Mi viaje» abierto.
- «Añadir fuente»: sheet inferior encima de los FABs + backdrop atenuado (no barra superior).
- «Mi viaje» y asistente: pantalla completa / capa superior.

### Chat del asistente
- Mensajes del **usuario**: bocadillo alineado a la derecha, fondo `muted` (no primary chillón).
- Mensajes del **asistente**: sin caja ni borde; texto a ancho del panel.
- Enlaces institucionales: clicables, sin botón «Añadir fuente».

### Home de viajes
- Tarjetas/lista con portada fotográfica (`coverUrl`) o emoji; acciones Archivar / Editar / Eliminar a primer nivel.

## 5) Qué no hacer

- No reintroducir Fraunces, brand turquesa ni primary terracota.
- No volver al split permanente Fuentes | Mi viaje en desktop.
- No reintroducir el breadcrumb en móvil ni FABs de detalle en desktop.
- No envolver las respuestas del asistente en cards con borde/sombra.
- No ofrecer «Añadir fuente» sobre webs gubernamentales / de visados como si fueran blogs de inspiración.
