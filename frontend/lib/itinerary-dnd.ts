/**
 * Hit-test de arrastre en Ruta › Lista.
 *
 * Los slots se miden sobre el array CON el ítem. `moveItemBetweenDays` aplica
 * `toIndex` sobre el array YA SIN el ítem cuando origen y destino coinciden:
 * hay que restar 1 si se suelta por debajo del origen en el mismo día.
 * Sin esa corrección la card cae una posición por encima de la línea.
 */

export type MeasuredItem = {
  id: string
  top: number
  bottom: number
}

export type MeasuredDay = {
  dayId: string
  top: number
  bottom: number
  items: MeasuredItem[]
}

export type Slot = {
  dayId: string
  index: number
  y: number
}

export type DragOrigin = {
  dayId: string
  itemId: string
  index: number
}

export type DropTarget = {
  dayId: string
  index: number
}

export type MoveParams = {
  fromDayId: string
  toDayId: string
  itemId: string
  toIndex: number
}

/** Centro del hueco entre cards (space-y), no el borde de la card inferior. */
function gapMidY(items: MeasuredItem[], index: number): number {
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return 0
  const typicalGap =
    items.length > 1 ? Math.max(0, items[1]!.top - first.bottom) : 10
  if (index <= 0) return first.top - typicalGap / 2
  if (index >= items.length) return last.bottom + typicalGap / 2
  return (items[index - 1]!.bottom + items[index]!.top) / 2
}

export function buildSlots(days: MeasuredDay[], draggingId: string): Slot[] {
  const slots: Slot[] = []

  for (const day of days) {
    const { items } = day
    const dragIndex = items.findIndex((item) => item.id === draggingId)

    if (items.length === 0) {
      slots.push({
        dayId: day.dayId,
        index: 0,
        y: (day.top + day.bottom) / 2,
      })
      continue
    }

    for (let index = 0; index <= items.length; index++) {
      // Los dos huecos pegados al ítem arrastrado son no-ops y hacen jitter.
      // El "home" (centro del ítem) cubre soltar en el sitio sin mover.
      if (dragIndex >= 0 && (index === dragIndex || index === dragIndex + 1)) {
        continue
      }
      slots.push({ dayId: day.dayId, index, y: gapMidY(items, index) })
    }

    if (dragIndex >= 0) {
      const item = items[dragIndex]!
      slots.push({
        dayId: day.dayId,
        index: dragIndex,
        y: (item.top + item.bottom) / 2,
      })
    }
  }

  return slots
}

export function resolveDropTarget(
  slots: Slot[],
  clientY: number,
  days?: readonly MeasuredDay[],
): DropTarget | null {
  if (slots.length === 0) return null

  const containing = days?.find((d) => clientY >= d.top && clientY <= d.bottom)
  const pool = containing ? slots.filter((s) => s.dayId === containing.dayId) : slots
  const search = pool.length > 0 ? pool : slots

  let best = search[0]!
  let bestDist = Math.abs(best.y - clientY)
  for (let i = 1; i < search.length; i++) {
    const slot = search[i]!
    const dist = Math.abs(slot.y - clientY)
    if (dist < bestDist) {
      best = slot
      bestDist = dist
    }
  }
  return { dayId: best.dayId, index: best.index }
}

export function toMoveParams(target: DropTarget, from: DragOrigin): MoveParams {
  const sameDay = target.dayId === from.dayId
  const toIndex =
    sameDay && target.index > from.index ? target.index - 1 : target.index
  return {
    fromDayId: from.dayId,
    toDayId: target.dayId,
    itemId: from.itemId,
    toIndex,
  }
}

export function isNoOpMove(params: MoveParams, from: DragOrigin): boolean {
  return params.toDayId === from.dayId && params.toIndex === from.index
}
