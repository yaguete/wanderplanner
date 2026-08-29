/**
 * Empaqueta el widget MCP Apps (React aislado) en un HTML inlined.
 * El artefacto `lib/mcp/ui/widget-html.ts` se commitea; CI regenera y
 * falla si `git diff` no está limpio.
 */
import { build } from "esbuild"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const entry = join(root, "mcp-ui/src/main.tsx")
const dest = join(root, "lib/mcp/ui/widget-html.ts")

const result = await build({
  absWorkingDir: root,
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  write: false,
  jsx: "automatic",
  minify: true,
  sourcemap: false,
  logLevel: "warning",
  define: { "process.env.NODE_ENV": '"production"' },
})

const js = result.outputFiles?.[0]?.text
if (!js) {
  throw new Error("esbuild no produjo el bundle del widget MCP")
}

const bootstrap = readFileSync(join(root, "mcp-ui/src/bootstrap.js"), "utf8")
const safeBootstrap = bootstrap.replace(/<\/script/gi, "<\\/script")
const safeJs = js.replace(/<\/script/gi, "<\\/script")

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root {
  color-scheme: light dark;
  --wp-bg: var(--color-background-primary, #fff);
  --wp-fg: var(--color-text-primary, #1a1513);
  --wp-ink: var(--color-text-primary, #86675B);
  --wp-muted: var(--color-text-secondary, #6b5a54);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--wp-bg);
  color: var(--wp-fg);
  font-size: 15px;
  line-height: 1.45;
}
.stack { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
.card, section, header {
  border: 1px solid color-mix(in srgb, var(--wp-ink) 18%, transparent);
  border-radius: 10px;
  padding: 12px;
}
h1 { font-size: 1.15rem; margin: 0; }
h2 { font-size: 1rem; margin: 0 0 4px; }
.kicker {
  margin: 0 0 4px;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--wp-muted);
}
.place, .empty { margin: 0; color: var(--wp-muted); }
blockquote {
  margin: 8px 0 0;
  padding-left: 10px;
  border-left: 2px solid var(--wp-ink);
  color: var(--wp-fg);
}
ul { margin: 8px 0 0; padding-left: 1.1rem; }
.cta { margin: 10px 0 0; }
a { color: var(--wp-ink); font-weight: 600; }
</style>
<script>${safeBootstrap}</script>
</head>
<body>
<div id="root"></div>
<script type="module">${safeJs}</script>
</body>
</html>
`

writeFileSync(
  dest,
  `/** Generado por scripts/build-mcp-ui.mjs. No editar a mano. */\nexport const MCP_WIDGET_HTML = ${JSON.stringify(html)}\n`,
)

console.log(`mcp-ui: wrote ${dest} (${html.length} chars)`)
