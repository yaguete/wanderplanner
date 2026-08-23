/** Alineado con `MOBILE_BREAKPOINT` de `use-mobile.ts`. */
const MOBILE_MAX_PX = 768

/**
 * Safari / Firefox iOS solo pliegan la barra de direcciones si el *root*
 * scroller se mueve. El asistente móvil congela el documento (`overflow:
 * hidden` en `data-wp-scroll-lock`) para anclar el composer, y entonces el
 * chrome se queda a la vista encima del teclado.
 *
 * ~48 px es el umbral habitual para que iOS considere el gesto un scroll
 * y no un toque. El panel del asistente es `position:fixed`, así que este
 * desplazamiento no se ve: corre detrás.
 */
export const COLLAPSED_CHROME_SCROLL_PX = 48

export function collapsedChromePin(innerHeight: number): {
  minHeight: number
  scrollY: number
} {
  return {
    minHeight: innerHeight + COLLAPSED_CHROME_SCROLL_PX,
    scrollY: COLLAPSED_CHROME_SCROLL_PX,
  }
}

/**
 * Mientras el teclado está abierto en el asistente móvil: quita el lock del
 * documento, deja 48 px de scroll en el root y scrollea para plegar el chrome.
 * Restaura lock y scroll al soltar. No-op fuera de móvil.
 *
 * No oculta la barra nativa «Hecho» / chevrones del teclado: eso es chrome
 * del SO y no hay API web para quitarla.
 */
export function pinRootScrollerForCollapsedChrome(): () => void {
  if (typeof window === "undefined") return () => {}
  if (window.innerWidth >= MOBILE_MAX_PX) return () => {}

  const html = document.documentElement
  const hadLock = html.dataset.wpScrollLock === "1"
  const prevMinHeight = html.style.minHeight
  const prevScrollY = window.scrollY
  const { minHeight, scrollY } = collapsedChromePin(window.innerHeight)

  delete html.dataset.wpScrollLock
  html.style.minHeight = `${minHeight}px`
  window.scrollTo(0, scrollY)

  return () => {
    html.style.minHeight = prevMinHeight
    window.scrollTo(0, prevScrollY)
    if (hadLock) html.dataset.wpScrollLock = "1"
  }
}
