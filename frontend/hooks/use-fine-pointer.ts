"use client"

import { useEffect, useState } from "react"

/** Puntero fino con hover (ratón, trackpad) frente a táctil. */
export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)"

/**
 * `null` hasta que se resuelve al montar; a partir de ahí, fijo.
 *
 * **No se suscribe a los cambios de la media query, a propósito.** Sus
 * consumidores no cambian un atributo: cambian de árbol —`Tooltip` por
 * `Popover`, `HoverCard` por lightbox— y se pintan cientos de veces (uno por
 * ítem con nota, por día del calendario y por miniatura). Si la media query
 * cambia en caliente, React desmonta y vuelve a montar de golpe todos esos
 * árboles de Radix; la cascada de `setState` que eso dispara en fase de commit
 * pasa del tope de 50 actualizaciones anidadas y revienta la aplicación entera
 * con «Maximum update depth exceeded» (React #185).
 *
 * En un dispositivo real esta consulta no cambia durante la sesión: lo que la
 * cambia es la simulación táctil de las herramientas de desarrollo (⌥⌘M en
 * Firefox) o acoplarle un trackpad a un iPad. En ese segundo caso la pista se
 * queda con la interacción que se resolvió al montar, que sigue siendo usable
 * —el popover se abre al tocar y también al hacer clic—, y se recoloca sola en
 * el siguiente montaje del panel.
 */
export function useFinePointer(): boolean | null {
  const [fine, setFine] = useState<boolean | null>(null)

  useEffect(() => {
    setFine(window.matchMedia(FINE_POINTER_QUERY).matches)
  }, [])

  return fine
}
