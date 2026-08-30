import assert from "node:assert/strict"
import {
  MCP_PRIVACY_CATEGORIES,
  MCP_PRIVACY_CATEGORY_IDS,
  MCP_PRIVACY_TOOLS,
  categoryForPath,
  collectJsonSchemaPropertyKeys,
  collectMcpSchemaPaths,
  jsonSchemaOf,
  mcpPrivacyTableRows,
} from "./privacy-inventory"

const paths = collectMcpSchemaPaths()
assert.ok(paths.length > 20, `demasiados pocos paths: ${paths.length}`)

{
  const tools = new Set(paths.map((p) => p.tool))
  for (const tool of MCP_PRIVACY_TOOLS) {
    assert.ok(tools.has(tool.name), `falta ${tool.name} en el inventario`)
  }
}

{
  const used = new Set<string>()
  for (const { tool, path } of paths) {
    const category = categoryForPath(tool, path)
    used.add(category)
  }
  for (const id of MCP_PRIVACY_CATEGORY_IDS) {
    assert.ok(used.has(id), `categoría vacía: ${id}`)
  }
  assert.equal(used.size, MCP_PRIVACY_CATEGORY_IDS.length)
}

{
  const sample = paths.find((p) => p.tool === "get_trip" && p.path.includes("quote"))
  assert.ok(sample, "get_trip debe declarar quote (cita de la fuente)")
  assert.equal(categoryForPath(sample.tool, sample.path), "tripDaysItems")
}

{
  const budget = paths.find((p) => p.tool === "get_trip_budget" && p.path.includes("verdict"))
  assert.ok(budget, "get_trip_budget debe declarar verdict")
  assert.equal(categoryForPath(budget.tool, budget.path), "budget")
}

{
  const keys = new Set<string>()
  for (const tool of MCP_PRIVACY_TOOLS) {
    for (const key of collectJsonSchemaPropertyKeys(jsonSchemaOf(tool.schema))) {
      keys.add(key)
    }
  }
  for (const forbidden of ["article_html", "share_card", "coords", "lat", "lng", "email", "phone"]) {
    assert.equal(keys.has(forbidden), false, `outputSchema no debe declarar ${forbidden}`)
  }
  assert.equal(keys.has("affiliateUrl"), true, "affiliateUrl está en el schema aunque el flag lo anule")
  assert.equal(keys.has("quote"), true)
  assert.equal(keys.has("wanderplannerUrl"), true)
}

{
  const rows = mcpPrivacyTableRows()
  assert.ok(rows.length === 1 + MCP_PRIVACY_CATEGORIES.length)
  assert.equal(rows[0][0], "Tu identidad de cuenta")
  assert.match(rows[0][1], /Correo/)
  assert.doesNotMatch(rows[0][1], /no (le )?enviamos tu correo/i)
}

console.log(`mcp-privacy-inventory: ${paths.length} paths, ok`)
