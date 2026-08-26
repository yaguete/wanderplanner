/**
 * Copia las banderas circulares de `circle-flags` a `public/circle-flags/`
 * para servirlas en el rail plegado sin CDN.
 */
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const src = join(root, "node_modules/circle-flags/flags")
const dest = join(root, "public/circle-flags")

const KEEP = /^(?:[a-z]{2}|gb-sct|gb-eng|gb-wls|gb-nir|es-ct)\.svg$/

const entries = readdirSync(src, { withFileTypes: true })
const files = entries
  .filter((e) => e.isFile() && KEEP.test(e.name))
  .map((e) => e.name)

mkdirSync(dest, { recursive: true })
for (const name of files) {
  cpSync(join(src, name), join(dest, name))
}

const kept = new Set(files)
for (const name of readdirSync(dest)) {
  if (!kept.has(name)) rmSync(join(dest, name))
}
