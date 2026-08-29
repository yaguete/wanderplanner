/**
 * Abrir un enlace desde el iframe MCP Apps.
 *
 * El sandbox suele bloquear `target=_blank`. El camino portable es
 * `ui/open-link`; ChatGPT también puede exponer `window.openai.openExternal`.
 * Se elige por feature detection, nunca por hostname.
 */

export type OpenAiHost = {
  openExternal?: (args: { href: string }) => unknown
  toolOutput?: unknown
}

export type JsonRpcResult = { isError?: boolean } | undefined

export async function openExternalUrl(
  url: string,
  deps: {
    openai?: OpenAiHost | null
    request?: (method: string, params: { url: string }) => Promise<JsonRpcResult>
    fallback: (href: string) => void
  },
): Promise<"openai" | "host" | "fallback"> {
  const href = url.trim()
  if (!href) return "fallback"

  if (typeof deps.openai?.openExternal === "function") {
    await deps.openai.openExternal({ href })
    return "openai"
  }

  if (deps.request) {
    try {
      const result = await deps.request("ui/open-link", { url: href })
      if (!result?.isError) return "host"
    } catch {
      // El host no implementa el método o lo rechazó: cae al fallback.
    }
  }

  deps.fallback(href)
  return "fallback"
}
