import * as React from 'react'

export const MOBILE_BREAKPOINT = 768

/** La misma consulta que el `md:` de Tailwind, invertida. */
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Lectura síncrona del viewport. Útil al montar un diálogo (el hook aún no ha hidratado).
 *
 * `matchMedia` y no `innerWidth`: es la misma señal que evalúa el CSS, así que
 * nunca puede discrepar del `md:`. `innerWidth` mide el viewport **visual** y
 * en un viewport emulado o con zoom (DevTools con DPR distinto de 1, pellizco
 * en móvil) devuelve otro número que el viewport de maquetación, que es contra
 * el que se resuelven las media queries.
 */
export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY)
    const onChange = () => {
      setIsMobile(mql.matches)
    }
    mql.addEventListener('change', onChange)
    setIsMobile(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}
