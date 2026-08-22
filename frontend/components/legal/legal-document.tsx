import type { ReactNode } from "react"
import { LEGAL, formatLegalDate } from "@/lib/legal"

export type LegalTocItem = { id: string; label: string }

export function LegalDocument({
  title,
  lede,
  toc,
  children,
}: {
  title: string
  lede?: ReactNode
  toc: readonly LegalTocItem[]
  children: ReactNode
}) {
  return (
    <main
      id="contenido"
      className="legal-main relative mx-auto w-full max-w-2xl px-6 pb-24 pt-24 sm:pt-28"
    >
      <h1 className="text-balance text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 text-sm text-foreground/55">
        Última actualización: {formatLegalDate(LEGAL.updatedAt)}
      </p>
      {lede ? (
        <div className="mt-6 space-y-4 text-pretty text-base leading-7 text-foreground/70">{lede}</div>
      ) : null}

      <nav aria-label="Índice" className="mt-8 flex flex-wrap gap-x-4 gap-y-1.5">
        {toc.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="text-sm text-foreground/50 underline-offset-4 hover:text-foreground hover:underline"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="legal-prose mt-14">{children}</div>
    </main>
  )
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="mt-12 first:mt-0">
      <h2 id={id} className="scroll-mt-24 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-pretty text-base leading-7 text-foreground/70">{children}</div>
    </section>
  )
}

export function LegalMail({ children }: { children?: ReactNode }) {
  return (
    <a
      href={`mailto:${LEGAL.email}`}
      className="font-medium text-foreground underline underline-offset-4"
    >
      {children ?? LEGAL.email}
    </a>
  )
}

export function LegalHolder({ children }: { children?: ReactNode }) {
  return (
    <a
      href={LEGAL.holderUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-foreground underline underline-offset-4"
    >
      {children ?? LEGAL.holderName}
    </a>
  )
}

export function LegalTable({
  columns,
  rows,
}: {
  columns: readonly string[]
  rows: readonly (readonly ReactNode[])[]
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="bg-background/80 text-foreground">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-3 py-2.5 font-semibold">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-foreground/70">
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2.5 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
