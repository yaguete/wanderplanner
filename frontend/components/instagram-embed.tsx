"use client"

import { canonicalInstagramUrl, instagramEmbedUrl } from "@/lib/instagram-url"

/**
 * Widget oficial de un post/reel. Instagram sirve el iframe; no persistimos fotos.
 * La búsqueda de Crónica sigue yendo sobre el HTML del pie, no sobre esto.
 */
export function InstagramEmbed({ url }: { url: string }) {
  const embed = instagramEmbedUrl(url)
  const permalink = canonicalInstagramUrl(url)
  if (!embed || !permalink) return null

  return (
    <figure className="mb-6 flex flex-col items-center">
      <iframe
        src={embed}
        title="Publicación de Instagram"
        className="h-[720px] w-full max-w-[540px] rounded-xl border border-border bg-muted"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="encrypted-media; clipboard-write; web-share; fullscreen"
      />
      <figcaption className="mt-2">
        <a
          href={permalink}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Ver en Instagram
        </a>
      </figcaption>
    </figure>
  )
}
