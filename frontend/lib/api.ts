import type { Itinerary } from "@/types/itinerary"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export async function fetchItinerary(url: string): Promise<Itinerary> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/itinerary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
  } catch (e) {
    const network =
      e instanceof TypeError
        ? `No se pudo conectar con el API en ${API_BASE}. Comprueba que el backend esté en marcha (p. ej. en el puerto 8000) y que CORS permita origin de esta app.`
        : e instanceof Error
          ? e.message
          : "Error de red"
    throw new Error(network)
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { detail?: unknown }
    const detail = Array.isArray(error.detail)
      ? error.detail.map((x) => String((x as { msg?: string }).msg ?? x)).join("; ")
      : error.detail != null
        ? String(error.detail)
        : null
    throw new Error(detail || `Error del servidor: HTTP ${response.status}`)
  }

  try {
    return await response.json()
  } catch {
    throw new Error("La respuesta del API no es JSON válido")
  }
}
