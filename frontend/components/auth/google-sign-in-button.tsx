"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { AuthMethodDivider } from "@/components/auth/auth-method-divider"
import { isGoogleAuthEnabled, startGoogleOAuth } from "@/lib/auth-google"

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.55-5.17 3.55-8.86Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.47 1.14-4.07 1.14-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27A7.21 7.21 0 0 1 4.89 12c0-.79.14-1.55.38-2.27V6.64H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.36l4-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.64l4 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}

export function GoogleSignInButton({
  next,
  rememberMe,
  claimUserId,
  disabled,
  onError,
  beforeRedirect,
  onKeepClaim,
}: {
  next: string
  rememberMe: boolean
  claimUserId?: string | null
  disabled?: boolean
  onError: (message: string) => void
  beforeRedirect?: () => Promise<boolean>
  onKeepClaim?: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  if (!isGoogleAuthEnabled()) return null

  const handleClick = async () => {
    onError("")
    setSubmitting(true)
    if (beforeRedirect) {
      const ready = await beforeRedirect()
      if (!ready) {
        setSubmitting(false)
        return
      }
    }
    onKeepClaim?.()
    const result = await startGoogleOAuth({
      next,
      rememberMe,
      claimUserId: claimUserId || undefined,
    })
    if (!result.ok) {
      onError(result.error)
      setSubmitting(false)
    }
  }

  return (
    <>
      <AuthMethodDivider />
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        disabled={disabled || submitting}
        onClick={() => void handleClick()}
      >
        {submitting ? (
          <Spinner className="size-4" />
        ) : (
          <GoogleMark className="size-4" />
        )}
        Continuar con Google
      </Button>
    </>
  )
}
