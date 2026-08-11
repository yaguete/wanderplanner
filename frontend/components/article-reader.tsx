'use client'

interface ArticleReaderProps {
  html: string
  referenceUrl: string
}

export default function ArticleReader({ html, referenceUrl }: ArticleReaderProps) {
  const hostname = (() => {
    try {
      return new URL(referenceUrl).hostname.replace("www.", "")
    } catch {
      return referenceUrl
    }
  })()

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-4">
        <p className="text-xs text-muted-foreground mb-4 pb-2 border-b">
          Source: {hostname}
        </p>
        <div
          className="prose-article mx-auto max-w-2xl"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
