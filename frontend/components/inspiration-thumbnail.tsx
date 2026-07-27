"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { Bus, Car, Plane, Ship, Train } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  buildBasicThumbQuery,
  buildThumbQuery,
  getBasicThumbnail,
  getItemThumbnail,
} from "@/lib/item-image"
import { resolveThumbUrlOrNull } from "@/lib/thumbs"
import { resolveVendorLogo } from "@/lib/vendor-logo"
import type { SourceBasicItem, SourceItem } from "@/types/itinerary"

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
 * Miniatura para la lista de inspiración: `thumbUrl` del servidor, o Places vía /thumb (nombre+región),
 * o Picsum como fallback. Carga diferida con IntersectionObserver.
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

function transportIconForText(label: string) {
  const t = label.toLowerCase()
  if (/(vuelo|av[ií]on|flight|air|aeropuerto)/i.test(t)) return Plane
  if (/(tren|train|rail)/i.test(t)) return Train
  if (/(bus|autob[uú]s|coach|minivan|shuttle)/i.test(t)) return Bus
  if (/(ferry|barco|boat)/i.test(t)) return Ship
  return Car
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
  if (mode === "transportIcon") {
    const Icon = transportIconForText(`${item.name} ${item.detail ?? ""}`)
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted" aria-label="Transporte">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
    )
  }

  const fallback = useMemo(() => getItemThumbnail(item), [item.id, item.type])
  const [src, setSrc] = useState<string | null>(() => item.thumbUrl ?? null)
  const [settled, setSettled] = useState(() => !!item.thumbUrl)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    setImageLoaded(false)
    if (item.thumbUrl) {
      setSrc(item.thumbUrl)
      setSettled(true)
      return
    }
    let cancel = false
    setSettled(false)
    const q = buildThumbQuery(item.name, item.region, area)
    if (!q) {
      setSrc(fallback)
      setSettled(true)
      return
    }
    void resolveThumbUrlOrNull(q).then((u) => {
      if (cancel) return
      setSrc(u ?? fallback)
      setSettled(true)
    })
    return () => {
      cancel = true
    }
  }, [item.id, item.thumbUrl, item.name, item.region, area, fallback])

  if (!settled || !src) {
    return <div className="h-full w-full animate-pulse bg-muted" aria-hidden />
  }
  return (
    <>
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
    </>
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
  const fallback = useMemo(() => getBasicThumbnail(item), [item.id, item.category])
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
      setSrc(fallback)
      setSettled(true)
      return
    }
    void resolveThumbUrlOrNull(q).then((u) => {
      if (cancel) return
      setSrc(u ?? fallback)
      setSettled(true)
    })
    return () => {
      cancel = true
    }
  }, [mode, logo.src, item.id, item.thumbUrl, item.name, item.category, area, fallback])

  if (!settled || !src) {
    return <div className="h-full w-full animate-pulse bg-muted" aria-hidden />
  }

  const imgClass = cn(
    "absolute inset-0 h-full w-full object-cover transition-opacity duration-200",
    imageLoaded ? "opacity-100" : "opacity-0",
  )

  return (
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
}
