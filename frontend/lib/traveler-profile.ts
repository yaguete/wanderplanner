/**
 * Catálogo de tipos de viajero. Los ids se guardan en `profiles.traveler_types` y viajan
 * al asistente dentro del briefing; las etiquetas son solo de UI.
 */
export const TRAVELER_TYPES = [
  { id: "urbano", label: "Urbano" },
  { id: "familia", label: "En familia" },
  { id: "playa", label: "Playa" },
  { id: "montana", label: "Montaña" },
  { id: "deporte", label: "Deporte y aventura" },
  { id: "relax", label: "Relax" },
  { id: "gastronomia", label: "Gastronomía" },
  { id: "cultura", label: "Cultura e historia" },
  { id: "naturaleza", label: "Naturaleza y paisajes" },
  { id: "fauna-exotica", label: "Fauna exótica" },
  { id: "mochilero", label: "Mochilero" },
  { id: "lujo", label: "Lujo" },
  { id: "roadtrip", label: "Road trip" },
  { id: "mascota", label: "Con mascota" },
  { id: "movilidad-reducida", label: "Movilidad reducida" },
] as const

export type TravelerTypeId = (typeof TRAVELER_TYPES)[number]["id"]

const LABEL_BY_ID = new Map<string, string>(TRAVELER_TYPES.map((t) => [t.id, t.label]))

export function travelerTypeLabel(id: string): string {
  return LABEL_BY_ID.get(id) ?? id
}

export function travelerTypeLabels(ids: string[]): string[] {
  return ids.map(travelerTypeLabel)
}
