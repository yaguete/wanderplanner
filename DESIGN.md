# WanderPlanner Design System

Identidad visual limpia y tecnológica para un workspace de viaje. Referencias: [Vercel](https://vercel.com/), [OpenAI](https://openai.com), [Mindtrip](https://mindtrip.ai/).

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

## 2) Color

| Token | Light | Uso |
|---|---|---|
| `--background` | `0 0% 100%` | Canvas |
| `--foreground` | `0 0% 9%` | Texto |
| `--primary` | `221 83% 53%` | Énfasis / CTAs (azul eléctrico) |
| `--muted` / `--accent` | `0 0% 96%` | Superficies sutiles |
| `--muted-foreground` | `0 0% 45%` | Meta |
| `--border` | `0 0% 90%` | Bordes |
| `--radius` | `0.625rem` | Radios |

Tipos de ítem: chip neutro + punto de color (`ITEM_COLORS.dot`).

## 3) Tipografía

Una sola familia: **Inter** (`--font-inter`). Sin display serif.

## 4) Layout del workspace

- Cabecera de viaje: miga de pan ~44px (`Inicio / Nombre · fechas`).
- Fuentes a ancho completo.
- Planificador: overlay derecho ~560px, abierto por defecto, ocultable.
- Móvil: planificador a pantalla completa.

## 5) Qué no hacer

- No reintroducir Fraunces, brand turquesa ni primary terracota.
- No volver al split permanente Fuentes | Mi viaje en desktop.
- No simular el chat del asistente.
