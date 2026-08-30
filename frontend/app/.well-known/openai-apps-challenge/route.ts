/**
 * Verificación de dominio del envío al directorio de complementos (T9.8).
 *
 * OpenAI da un token en el formulario de envío y lo pide en esta URL fija para
 * confirmar que `wanderplanner.ai` es nuestro. Devuelve **solo el token, en
 * texto plano**: ni JSON, ni lista, ni comillas — el verificador compara la
 * respuesta entera con el valor que emitió.
 *
 * El token llega en el formulario, así que la ruta se despliega antes de
 * tenerlo: sin `OPENAI_APPS_CHALLENGE` responde 404 en vez de un 200 vacío,
 * para no anunciar un desafío que no existe. Al ponerla en Vercel hace falta
 * **redesplegar**: un cambio de env no afecta al deployment en curso.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(): Response {
  const token = (process.env.OPENAI_APPS_CHALLENGE ?? "").trim()
  if (!token) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  return new Response(token, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
