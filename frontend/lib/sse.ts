/**
 * Parser mínimo de Server-Sent Events (SSE) para streams `text/event-stream`.
 */
export async function* parseSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<{ event: string; data: unknown }> {
  const decoder = new TextDecoder()
  let buffer = ""
  let eventName = "message"
  let dataLines: string[] = []

  const flush = (): { event: string; data: unknown } | null => {
    if (!dataLines.length) {
      eventName = "message"
      return null
    }
    const raw = dataLines.join("\n")
    dataLines = []
    const ev = eventName
    eventName = "message"
    try {
      return { event: ev, data: JSON.parse(raw) }
    } catch {
      return { event: ev, data: raw }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split("\n")
    buffer = parts.pop() ?? ""
    for (const line of parts) {
      if (line === "") {
        const item = flush()
        if (item) yield item
        continue
      }
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart())
      }
    }
  }
  const last = flush()
  if (last) yield last
}
