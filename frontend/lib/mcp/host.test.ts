import assert from "node:assert/strict"
import {
  MCP_DEDICATED_HOST,
  hostnameFromHeaders,
  hostnameOf,
  isMcpDedicatedHost,
  isMcpHostAllowedPath,
  mcpHostGate,
  mcpHostRedirectUrl,
  robotsForHostname,
} from "./host"

const SITE = "wanderplanner.ai"
const MCP = MCP_DEDICATED_HOST

function hdrs(init: Record<string, string>): Headers {
  return new Headers(init)
}

function gate(hostname: string, pathname: string) {
  return mcpHostGate({ hostname, pathname })
}

// --- hostnameOf ---
{
  assert.equal(hostnameOf("mcp.wanderplanner.ai"), MCP)
  assert.equal(hostnameOf("MCP.WanderPlanner.AI"), MCP, "minúsculas")
  assert.equal(hostnameOf("mcp.wanderplanner.ai:443"), MCP, "sin puerto")
  assert.equal(
    hostnameOf("mcp.wanderplanner.ai, wanderplanner.ai"),
    MCP,
    "primer valor de la lista",
  )
  assert.equal(hostnameOf("  mcp.wanderplanner.ai  "), MCP)
  assert.equal(hostnameOf(null), "")
  assert.equal(hostnameOf(undefined), "")
  assert.equal(hostnameOf(""), "")
}

// --- hostnameFromHeaders: x-forwarded-host gana a host ---
{
  assert.equal(
    hostnameFromHeaders(
      hdrs({
        "x-forwarded-host": MCP,
        host: "wanderplanner-xxx.vercel.app",
      }),
    ),
    MCP,
    "Vercel: el host público va en x-forwarded-host, no en el del deployment",
  )
  assert.equal(
    hostnameFromHeaders(hdrs({ host: MCP })),
    MCP,
    "sin proxy, cae a Host",
  )
  assert.equal(
    hostnameFromHeaders(
      hdrs({ "x-forwarded-host": `${MCP}, ${SITE}` }),
    ),
    MCP,
  )
}

// --- isMcpDedicatedHost ---
{
  assert.equal(isMcpDedicatedHost(MCP), true)
  assert.equal(isMcpDedicatedHost(`${MCP}:443`), true)
  assert.equal(isMcpDedicatedHost(SITE), false)
  assert.equal(isMcpDedicatedHost("wp-git-abc.vercel.app"), false)
  assert.equal(isMcpDedicatedHost("localhost"), false)
}

// --- isMcpHostAllowedPath ---
{
  assert.equal(isMcpHostAllowedPath("/"), true)
  assert.equal(isMcpHostAllowedPath("/mcp"), true)
  assert.equal(isMcpHostAllowedPath("/robots.txt"), true)
  assert.equal(isMcpHostAllowedPath("/.well-known"), true)
  assert.equal(
    isMcpHostAllowedPath("/.well-known/oauth-protected-resource"),
    true,
  )
  assert.equal(
    isMcpHostAllowedPath("/.well-known/oauth-protected-resource/mcp"),
    true,
  )
  assert.equal(
    isMcpHostAllowedPath("/.well-known/openai-apps-challenge"),
    true,
  )
  assert.equal(isMcpHostAllowedPath("/trips"), false)
  assert.equal(isMcpHostAllowedPath("/mcp-extra"), false)
  assert.equal(isMcpHostAllowedPath("/.well-known-not"), false)
}

// --- mcpHostGate: el producto no se cierra ---
{
  assert.equal(gate(SITE, "/"), "pass")
  assert.equal(gate(SITE, "/trips"), "pass")
  assert.equal(gate(SITE, "/mcp"), "pass")
  assert.equal(gate(SITE, "/login"), "pass")
  assert.equal(gate("wp-git-abc.vercel.app", "/trips"), "pass")
  assert.equal(gate("localhost:3000", "/"), "pass")
}

// --- mcpHostGate: host dedicado ---
{
  assert.equal(gate(MCP, "/"), "pass")
  assert.equal(gate(MCP, "/mcp"), "pass")
  assert.equal(gate(MCP, "/robots.txt"), "pass")
  assert.equal(gate(MCP, "/.well-known/oauth-protected-resource"), "pass")
  assert.equal(gate(MCP, "/.well-known/oauth-protected-resource/mcp"), "pass")
  assert.equal(gate(MCP, "/.well-known/openai-apps-challenge"), "pass")
  assert.equal(gate(MCP, "/trips"), "redirect")
  assert.equal(gate(MCP, "/login"), "redirect")
  assert.equal(gate(MCP, "/sitemap.xml"), "redirect")
  assert.equal(gate(MCP, "/partners"), "redirect")
  assert.equal(gate(MCP, "/start"), "redirect")
  assert.equal(gate(MCP, "/oauth/consent"), "redirect")
  assert.equal(
    gate(`${MCP}:443`, "/trips"),
    "redirect",
    "puerto no abre la puerta",
  )
}

// --- redirect URL ---
{
  assert.equal(mcpHostRedirectUrl("/trips"), "https://wanderplanner.ai/trips")
  assert.equal(
    mcpHostRedirectUrl("/start", "?source=https://example.com&ref=wp-landing"),
    "https://wanderplanner.ai/start?source=https://example.com&ref=wp-landing",
  )
}

// --- robots ---
{
  const dedicated = robotsForHostname(MCP)
  assert.equal(dedicated.rules.disallow, "/")
  assert.equal(dedicated.rules.allow, undefined, "sin Allow: / en el MCP")
  assert.equal(dedicated.sitemap, undefined, "sin sitemap en el MCP")

  const main = robotsForHostname(SITE)
  assert.equal(main.rules.allow, "/")
  assert.deepEqual(main.rules.disallow, [
    "/trips",
    "/account",
    "/oauth",
    "/mcp",
  ])
  assert.equal(main.sitemap, "https://wanderplanner.ai/sitemap.xml")

  const preview = robotsForHostname("wp-git-abc.vercel.app")
  assert.equal(preview.rules.allow, "/")
  assert.ok(
    Array.isArray(preview.rules.disallow) &&
      preview.rules.disallow.includes("/mcp"),
  )
}

console.log("mcp-host: ok")
