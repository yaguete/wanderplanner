"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { MOCK_USER } from "@/lib/mock-user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 18c3-1.5 5-5 5-8.5C9 6 10.5 4 12 4s3 2 3 5.5C15 13 17 16.5 20 18" />
        <path d="M8.5 14.5c1.2.6 2.5.9 3.5.9s2.3-.3 3.5-.9" />
      </svg>
    </div>
  )
}

type AppHeaderProps = {
  leading?: ReactNode
  /** En móvil: al pulsar el avatar (abre el menú lateral). */
  onAvatarClick?: () => void
}

export function AppHeader({ leading, onAvatarClick }: AppHeaderProps) {
  const initials = MOCK_USER.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const avatar = (
    <Avatar className="size-7">
      {MOCK_USER.avatarUrl ? <AvatarImage src={MOCK_USER.avatarUrl} alt="" /> : null}
      <AvatarFallback className="bg-secondary text-[10px] font-medium text-secondary-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  )

  return (
    <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border bg-background px-3 sm:px-4">
      {leading}
      <Link
        href="/trips"
        className="flex min-w-0 items-center gap-2 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BrandMark />
        <span className="truncate text-sm font-semibold tracking-tight">WanderPlanner</span>
      </Link>
      <div className="flex-1" />
      <span className="hidden text-sm text-muted-foreground sm:inline">{MOCK_USER.name}</span>
      {onAvatarClick ? (
        <button
          type="button"
          onClick={onAvatarClick}
          className="rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Abrir menú"
        >
          {avatar}
        </button>
      ) : (
        avatar
      )}
    </header>
  )
}
