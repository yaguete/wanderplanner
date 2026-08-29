/**
 * Recurso de UI del widget MCP.
 *
 * **MIME**: ChatGPT ejecuta hoy el runtime del Apps SDK, que busca los recursos
 * `ui://…` con `text/html+skybridge`. La spec nueva de MCP Apps usa
 * `text/html;profile=mcp-app`, y servir ESE fue lo que provocó
 * «Failed to fetch template» (29 ago 2026): el recurso se servía bien, pero el
 * host no lo reconocía como plantilla. Emitimos los metadatos de las dos
 * familias —`ui.*` y `openai/*`— porque cada host ignora las claves que no
 * conoce; el MIME, en cambio, solo puede ser uno, y manda el runtime desplegado.
 *
 * **URI sin versión**: no la conviertas en `…/v2.html` para forzar refrescos.
 * OpenAI dejó de congelar el HTML —los cambios se propagan solos en unas horas—
 * y cambiar la URI es justo lo que reproduce «Failed to fetch template», porque
 * la plataforma cachea por URI y deja de encontrar la plantilla anterior.
 */
export const MCP_WIDGET_URI = "ui://wanderplanner/widgets/main.html"
export const MCP_WIDGET_MIME = "text/html+skybridge"

export const MCP_WIDGET_CSP = {
  connectDomains: [] as string[],
  resourceDomains: [] as string[],
}

/** Metadatos del recurso, en las dos familias. Van en `resources/list` y en la lectura. */
export function widgetResourceMeta() {
  return {
    ui: {
      prefersBorder: true,
      csp: MCP_WIDGET_CSP,
    },
    "openai/widgetPrefersBorder": true,
    "openai/widgetCSP": {
      connect_domains: [] as string[],
      resource_domains: [] as string[],
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
