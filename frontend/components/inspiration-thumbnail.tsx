"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { buildBasicThumbQuery, buildThumbQuery } from "@/lib/item-image"
import { resolveThumbUrlOrNull, type ThumbAttribution } from "@/lib/thumbs"
import { resolveVendorLogo } from "@/lib/vendor-logo"
import {
  resolveTransportModeVisual,
  TRANSPORT_MODE_A11Y,
  TRANSPORT_MODE_ICONS,
} from "@/lib/item-styles"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { SourceBasicItem, SourceItem } from "@/types/itinerary"
import { useFinePointer } from "@/hooks/use-fine-pointer"

type ItineraryItemProps = {
  kind: "item"
  item: SourceItem
  area: string | null
}

type BasicProps = {
  kind: "basic"
  item: SourceBasicItem
  area: string | null
}

type InspirationThumbnailProps = (ItineraryItemProps | BasicProps) & {
  className?: string
  mode?: "default" | "vendorLogo" | "transportIcon"
}

/**
 * Miniatura para la lista de inspiración: `thumbUrl` del servidor o GET /thumb
 * (Commons en actividades, Places de cola). Sin foto, hueco mudo. Carga diferida.
 */
export function InspirationThumbnail({ className, ...props }: InspirationThumbnailProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ob = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true)
            ob.disconnect()
            break
          }
        }
      },
      { root: null, rootMargin: "120px", threshold: 0.01 },
    )
    ob.observe(el)
    return () => ob.disconnect()
  }, [])

  if (props.kind === "item") {
    return (
      <div ref={containerRef} className={cn("relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted", className)}>
        {visible ? (
          <ItineraryItemInner item={props.item} area={props.area} mode={props.mode ?? "default"} />
        ) : (
          <div className="h-full w-full animate-pulse bg-muted" aria-hidden />
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn("relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted", className)}>
      {visible ? (
        <BasicInner item={props.item} area={props.area} mode={props.mode ?? "default"} />
      ) : (
        <div className="h-full w-full animate-pulse bg-muted" aria-hidden />
      )}
    </div>
  )
}

function ItineraryItemInner({
  item,
  area,
  mode,
}: {
  item: SourceItem
  area: string | null
  mode: "default" | "vendorLogo" | "transportIcon"
}) {
  // Los hooks van antes de cualquier return condicional: React los empareja por
  // orden de llamada, y salir antes en modo icono dejaba esta función con 0 hooks
  // en una rama y 5 en la otra (react-hooks/rules-of-hooks).
  const isTransportIcon = mode === "transportIcon"

  const [src, setSrc] = useState<string | null>(() => item.thumbUrl ?? null)
  const [attribution, setAttribution] = useState<ThumbAttribution | null>(null)
  const [settled, setSettled] = useState(() => !!item.thumbUrl)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    // En modo icono no se pinta foto: ni se resuelve miniatura ni se gasta cuota.
    if (isTransportIcon) return
    setImageLoaded(false)
    setAttribution(null)
    if (item.thumbUrl) {
      setSrc(item.thumbUrl)
      setSettled(true)
      return
    }
    let cancel = false
    setSettled(false)
    const q = buildThumbQuery(item.name, item.region, area)
    if (!q) {
      setSrc(null)
      setSettled(true)
      return
    }
    void resolveThumbUrlOrNull(q, { kind: item.type, name: item.name }).then((payload) => {
      if (cancel) return
      setSrc(payload.url)
      setAttribution(payload.attribution)
      setSettled(true)
    })
    return () => {
      cancel = true
    }
  }, [isTransportIcon, item.id, item.thumbUrl, item.name, item.region, item.type, area])

  if (isTransportIcon) {
    const visual = resolveTransportModeVisual({
      hint: item.sourceRouteHint,
      name: item.name,
      detail: item.detail,
      preferHint: true,
    })
    const Icon = TRANSPORT_MODE_ICONS[visual]
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-muted"
        aria-label={TRANSPORT_MODE_A11Y[visual]}
      >
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
    )
  }

  if (!settled) {
    return <div className="h-full w-full animate-pulse bg-muted" aria-hidden />
  }
  if (!src) {
    return <div className="h-full w-full bg-muted" aria-hidden />
  }
  return (
    <PhotoPreview src={src} ready={imageLoaded} attribution={attribution}>
      {!imageLoaded ? (
        <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
      ) : null}
      <Image
        src={src}
        alt=""
        fill
        sizes="64px"
        className={cn("object-cover transition-opacity duration-200", imageLoaded ? "opacity-100" : "opacity-0")}
        unoptimized
        onLoad={() => setImageLoaded(true)}
      />
    </PhotoPreview>
  )
}

function BasicInner({
  item,
  area,
  mode,
}: {
  item: SourceBasicItem
  area: string | null
  mode: "default" | "vendorLogo" | "transportIcon"
}) {
  const logo = useMemo(
    () => resolveVendorLogo({ vendor: item.vendor, affiliateUrl: item.affiliateUrl }),
    [item.vendor, item.affiliateUrl],
  )
  const initial = mode === "vendorLogo" && logo.src ? logo.src : (item.thumbUrl ?? null)
  const [src, setSrc] = useState<string | null>(() => initial)
  const [settled, setSettled] = useState(() => !!initial)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    setImageLoaded(false)
    if (mode === "vendorLogo" && logo.src) {
      setSrc(logo.src)
      setSettled(true)
      return
    }
    if (item.thumbUrl) {
      setSrc(item.thumbUrl)
      setSettled(true)
      return
    }
    let cancel = false
    setSettled(false)
    const q = buildBasicThumbQuery(item.name, item.category, area)
    if (!q) {
      setSrc(null)
      setSettled(true)
      return
    }
    void resolveThumbUrlOrNull(q, { kind: "basic", name: item.name }).then((payload) => {
      if (cancel) return
      setSrc(payload.url)
      setSettled(true)
    })
    return () => {
      cancel = true
    }
  }, [mode, logo.src, item.id, item.thumbUrl, item.name, item.category, area])

  if (!settled) {
    return <div className="h-full w-full animate-pulse bg-muted" aria-hidden />
  }
  if (!src) {
    return <div className="h-full w-full bg-muted" aria-hidden />
  }

  const imgClass = cn(
    "absolute inset-0 h-full w-full object-cover transition-opacity duration-200",
    imageLoaded ? "opacity-100" : "opacity-0",
  )

  const photo = (
    <>
      {!imageLoaded ? (
        <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
      ) : null}
      {mode === "vendorLogo" ? (
        <img
          src={src}
          alt=""
          className={imgClass}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setImageLoaded(true)}
        />
      ) : (
        <Image
          src={src}
          alt=""
          fill
          sizes="64px"
          className={cn("object-cover transition-opacity duration-200", imageLoaded ? "opacity-100" : "opacity-0")}
          unoptimized
          onLoad={() => setImageLoaded(true)}
        />
      )}
    </>
  )

  // Logos de proveedor: ampliarlos no aporta; las fotos de Places sí.
  if (mode === "vendorLogo") return photo
  return (
    <PhotoPreview src={src} ready={imageLoaded}>
      {photo}
    </PhotoPreview>
  )
}

function PhotoPreview({
  src,
  ready,
  attribution,
  children,
}: {
  src: string
  ready: boolean
  attribution?: ThumbAttribution | null
  children: ReactNode
}) {
  const finePointer = useFinePointer()
  const [lightbox, setLightbox] = useState(false)

  const openLightbox = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault()
    event.stopPropagation()
    setLightbox(true)
  }

  if (!ready) return children

  const lightboxUi = (
    <ThumbLightbox src={src} open={lightbox} onOpenChange={setLightbox} attribution={attribution} />
  )

  if (finePointer === true) {
    return (
      <HoverCard openDelay={280} closeDelay={80}>
        <HoverCardTrigger asChild>
          <div className="relative h-full w-full cursor-zoom-in">{children}</div>
        </HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="center"
          sideOffset={10}
          collisionPadding={16}
          className="z-[80] w-auto overflow-hidden rounded-xl border-border p-0 shadow-lg"
        >
          <img src={src} alt="" className="h-72 w-72 object-cover" />
          <AttributionLine attribution={attribution} className="px-3 py-2" />
        </HoverCardContent>
      </HoverCard>
    )
  }

  return (
    <>
      <div
        className="relative h-full w-full"
        role={finePointer === false ? "button" : undefined}
        tabIndex={finePointer === false ? 0 : undefined}
        aria-label={finePointer === false ? "Ver foto" : undefined}
        onPointerDown={
          finePointer === false
            ? (event) => {
                event.stopPropagation()
              }
            : undefined
        }
        onClick={finePointer === false ? openLightbox : undefined}
        onKeyDown={
          finePointer === false
            ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                openLightbox(event)
              }
            : undefined
        }
      >
        {children}
      </div>
      {lightboxUi}
    </>
  )
}

function AttributionLine({
  attribution,
  className,
}: {
  attribution?: ThumbAttribution | null
  className?: string
}) {
  if (!attribution) return null
  const label = `Foto: ${attribution.author} · ${attribution.license}`
  const textClass = cn("block max-w-72 truncate text-[11px] leading-snug text-muted-foreground", className)
  if (!attribution.creditUrl) {
    return <p className={textClass}>{label}</p>
  }
  return (
    <a
      href={attribution.creditUrl}
      target="_blank"
      rel="noreferrer"
      className={cn(textClass, "underline-offset-2 hover:underline")}
      onClick={(event) => event.stopPropagation()}
    >
      {label}
    </a>
  )
}

function ThumbLightbox({
  src,
  open,
  onOpenChange,
  attribution,
}: {
  src: string
  open: boolean
  onOpenChange: (open: boolean) => void
  attribution?: ThumbAttribution | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        className="max-w-[min(92vw,32rem)] gap-0 border-0 bg-transparent p-0 shadow-none"
        onClick={() => onOpenChange(false)}
      >
        <DialogTitle className="sr-only">Foto</DialogTitle>
        <img
          src={src}
          alt=""
          className="max-h-[80vh] w-full rounded-xl object-contain"
        />
        {attribution ? (
          <div className="mt-2 rounded-md bg-background/90 px-2 py-1.5 text-center">
            <AttributionLine attribution={attribution} className="mx-auto max-w-full" />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
