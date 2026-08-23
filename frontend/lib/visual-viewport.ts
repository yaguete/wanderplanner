/**
 * Caja del visual viewport y chrome nativo que tapa un overlay `position:fixed`.
 *
 * En iOS, `100dvh` / `inset-0` son el layout viewport. Safari suele encogerlo
 * con la barra; Firefox iOS (WKWebView a pantalla completa + chrome flotante)
 * no: la barra de direcciones tapa el borde inferior. Un zoom residual
 * (input < 16px) agrava el mismo hueco. El visual viewport es el rectángulo
 * que el usuario ve de verdad.
 */

/** Tailwind `sm`: por debajo, `fullscreenOnMobile` ocupa toda la pantalla. */
export const DIALOG_FULLSCREEN_MAX_PX = 640

/**
 * Alto del chrome inferior de Firefox iOS cuando visualViewport no lo resta
 * (address bar + toolbar ~104 px en un iPhone con home indicator).
 */
export const FXIOS_OVERLAY_BOTTOM_PX = 104

const REPORTED_OCCLUSION_PX = 8

export function isDialogFullscreenViewport(
  width = typeof window === "undefined" ? DIALOG_FULLSCREEN_MAX_PX : window.innerWidth,
): boolean {
  return width < DIALOG_FULLSCREEN_MAX_PX
}

/** Extra a restar por abajo cuando el visual viewport no reporta el overlay. */
export function overlayChromeInset(userAgent: string, reportedBottomOcclusion: number): number {
  if (reportedBottomOcclusion > REPORTED_OCCLUSION_PX) return 0
  return /FxiOS/i.test(userAgent) ? FXIOS_OVERLAY_BOTTOM_PX : 0
}

export type ViewportBox = {
  top: number
  left: number
  width: number
  height: number
}

export function visualViewportFillBox(
  vv: { offsetTop: number; offsetLeft: number; width: number; height: number } | null | undefined,
  opts: { layoutHeight: number; userAgent: string },
): ViewportBox | null {
  if (!vv) return null
  const reported = Math.max(0, opts.layoutHeight - vv.height - vv.offsetTop)
  const extra = overlayChromeInset(opts.userAgent, reported)
  return {
    top: vv.offsetTop,
    left: vv.offsetLeft,
    width: vv.width,
    height: Math.max(0, vv.height - extra),
  }
}
