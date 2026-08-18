"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { outbound } from "@/lib/funnel-analytics"
import { cn } from "@/lib/utils"

function isHttpUrl(href: string | undefined): href is string {
  return !!href && /^https?:\/\//i.test(href)
}

/** Renderiza markdown del asistente con tipografía compacta para el chat. */
export function AssistantMarkdown({
  content,
  className,
}: {
  content: string
  className?: string
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
            // Cita, no CTA: indexar un artículo va por propose_add_source o el panel Fuentes.
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="wp-ext-link break-all font-medium underline underline-offset-2"
                onClick={() => outbound(href, { surface: "assistant", affiliate: "auto" })}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
