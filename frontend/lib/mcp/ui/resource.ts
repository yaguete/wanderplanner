export const MCP_WIDGET_URI = "ui://wanderplanner/widgets/v3.html"
export const MCP_WIDGET_MIME = "text/html;profile=mcp-app"

export const MCP_WIDGET_CSP = {
  connectDomains: [] as string[],
  resourceDomains: [] as string[],
}

export function widgetResourceMeta() {
  return {
    ui: {
      prefersBorder: true,
      csp: MCP_WIDGET_CSP,
    },
  }
}

/** `_meta.ui.resourceUri` (MCP Apps) + alias de ChatGPT. */
export function widgetToolMeta() {
  return {
    ui: { resourceUri: MCP_WIDGET_URI },
    "openai/outputTemplate": MCP_WIDGET_URI,
  } as const
}
