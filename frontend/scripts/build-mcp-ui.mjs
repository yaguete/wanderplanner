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
const css = readFileSync(join(root, "mcp-ui/src/widget.css"), "utf8")
const safeBootstrap = bootstrap.replace(/<\/script/gi, "<\\/script")
const safeCss = css.replace(/<\/style/gi, "<\\/style")
const safeJs = js.replace(/<\/script/gi, "<\\/script")

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${safeCss}</style>
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
