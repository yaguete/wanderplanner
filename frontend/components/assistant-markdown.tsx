"use client"

import { Loader2, Plus } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { isInspirationalSourceUrl } from "@/lib/inspirational-source"
import { cn } from "@/lib/utils"

function isHttpUrl(href: string | undefined): href is string {
  return !!href && /^https?:\/\//i.test(href)
}

function normalizeSourceUrl(url: string): string {
  try {
    const u = new URL(url.trim())
    u.hash = ""
    let path = u.pathname
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
    u.pathname = path
    return u.toString()
  } catch {
    return url.trim()
  }
}

/** Renderiza markdown del asistente con tipografía compacta para el chat. */
export function AssistantMarkdown({
  content,
  className,
  onAddSourceLink,
  busyUrl,
  addedUrls,
}: {
  content: string
  className?: string
  /** Añade la URL como fuente del viaje (botón «Añadir fuente»). */
  onAddSourceLink?: (url: string) => void
  busyUrl?: string | null
  addedUrls?: ReadonlySet<string>
}) {
  if (!content.trim()) return null

  return (
    <div
      className={cn(
        "assistant-md break-words text-left text-sm leading-relaxed",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_p]:my-2 [&_p]:text-left [&_p]:leading-relaxed",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-4",
        "[&_li]:leading-snug",
        "[&_h1]:mb-1.5 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold",
        "[&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold",
        "[&_h3]:mb-1 [&_h3]:mt-2.5 [&_h3]:text-sm [&_h3]:font-semibold",
        "[&_hr]:my-3 [&_hr]:border-border",
        "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-2.5 [&_pre]:text-xs",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (!isHttpUrl(href)) {
              return <span className="font-medium text-foreground">{children}</span>
            }

            const normalized = normalizeSourceUrl(href)
            const added = Boolean(
              addedUrls?.has(normalized) || addedUrls?.has(href),
            )
            const busy = busyUrl === href || busyUrl === normalized
            // Solo blogs/guías: no ofrecer «Añadir fuente» en ministerios, visados, etc.
            const showAdd = Boolean(onAddSourceLink) && isInspirationalSourceUrl(href)

            const link = (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="break-all font-medium text-primary underline underline-offset-2"
              >
                {children}
              </a>
            )

            // Sin botón: enlace en línea (misma baseline que el texto).
            // Con botón: columna debajo; el flex-col sacaría el link de la línea base.
            if (!showAdd) return link

            return (
              <span className="my-1 inline-flex max-w-full min-w-0 flex-col items-start gap-1.5 align-top text-left not-prose">
                {link}
                <button
                  type="button"
                  onClick={() => {
                    if (!busy && !added) onAddSourceLink?.(href)
                  }}
                  disabled={busy || added}
                  className={cn(
                    "inline-flex h-7 w-fit max-w-full items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors",
                    added
                      ? "cursor-default border-border bg-muted/40 text-muted-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted",
                    "disabled:pointer-events-none disabled:opacity-60",
                  )}
                  aria-label={
                    added
                      ? "Fuente ya añadida"
                      : busy
                        ? "Añadiendo fuente"
                        : "Añadir como fuente al viaje"
                  }
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      Añadiendo…
                    </>
                  ) : added ? (
                    "Fuente añadida"
                  ) : (
                    <>
                      <Plus className="h-3 w-3" aria-hidden />
                      Añadir fuente
                    </>
                  )}
                </button>
              </span>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
