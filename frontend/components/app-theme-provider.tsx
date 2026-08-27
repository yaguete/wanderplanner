"use client"

import { usePathname } from "next/navigation"
import { ThemeProvider } from "@/components/theme-provider"
import { isForcedLightPath } from "@/lib/theme-scope"
import { ThemeColorMeta } from "@/components/theme-color-meta"

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="wp-theme"
      disableTransitionOnChange
      forcedTheme={isForcedLightPath(pathname) ? "light" : undefined}
    >
      {isForcedLightPath(pathname) ? (
        <script
          dangerouslySetInnerHTML={{
            __html:
              'document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";',
          }}
        />
      ) : null}
      <ThemeColorMeta />
      {children}
    </ThemeProvider>
  )
}
