"use client"

import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AuthShell } from "@/components/auth/auth-shell"
import { SignupForm } from "@/components/auth/signup-form"
import { safeNext } from "@/lib/auth-next"
import { useAuth } from "@/lib/auth-context"

function SignupPageBody() {
  const searchParams = useSearchParams()
  const { isGuest } = useAuth()
  const next = safeNext(searchParams.get("next"))

  return (
    <AuthShell
      title={isGuest ? "Guarda tu viaje" : "Crea tu cuenta"}
      subtitle={
        isGuest
          ? "Conserva lo que ya has planificado y sigue desde cualquier dispositivo."
          : "Cuéntanos cómo viajas y el asistente afinará sus recomendaciones."
      }
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Entrar
          </Link>
        </>
      }
    >
      <SignupForm next={next} />
    </AuthShell>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageBody />
    </Suspense>
  )
}
