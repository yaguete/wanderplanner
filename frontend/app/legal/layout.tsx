import { LandingHeader } from "@/components/landing/landing-header"
import { LandingFooter } from "@/components/landing/landing-footer"

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <div className="legal-shell relative min-h-screen bg-canvas">
        <div
          aria-hidden
          className="legal-veil landing-brand-veil pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        />
        <LandingHeader showSignup />
        <div className="relative">{children}</div>
        <LandingFooter />
      </div>
    </>
  )
}
