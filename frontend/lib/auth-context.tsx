"use client"

/**
 * Sesión de Supabase + perfil de viajero.
 *
 * El modo invitado usa sesiones anónimas: el invitado ya es un `user_id` real, así que al
 * registrarse solo se le añaden email y contraseña (`upgradeGuest`) y conserva sus viajes
 * sin migración. Para entrar en una cuenta *ya existente* el viaje viaja por
 * `prepare_guest_trip_claim` / `claim_guest_trips` (`guest-trip-claim.ts`).
 * `isGuest` es lo que consulta el RegistrationGate.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { Session, User } from "@supabase/supabase-js"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import {
  loadFavoriteReferences,
  loadProfile,
  replaceFavoriteReferences,
  saveProfile,
  type FavoriteReference,
  type FavoriteReferenceInput,
  type TravelerProfile,
} from "@/lib/db/profile-repo"
import { clearActiveConversationPointers } from "@/lib/db/assistant-repo"
import { clearStash } from "@/lib/guest-trip-claim"

export type AuthResult = { ok: true } | { ok: false; error: string }

type ProfileInput = {
  displayName: string | null
  travelerTypes: string[]
  travelerNotes: string | null
  favoriteReferences: FavoriteReferenceInput[]
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: TravelerProfile | null
  favoriteReferences: FavoriteReference[]
  /** Sesión aún sin resolver (primer arranque). */
  isLoading: boolean
  /** Hay sesión pero es anónima: puede planificar, no puede persistir su cuenta. */
  isGuest: boolean
  signIn: (email: string, password: string, captchaToken?: string) => Promise<AuthResult>
  signUp: (
    data: { email: string; password: string; captchaToken?: string } & Partial<ProfileInput>,
  ) => Promise<AuthResult>
  /** Convierte la sesión anónima en cuenta real conservando el `user_id`. */
  upgradeGuest: (
    data: { email: string; password: string } & Partial<ProfileInput>,
  ) => Promise<AuthResult>
  signInAnonymously: (
    options?: { referrer?: string | null; captchaToken?: string },
  ) => Promise<AuthResult>
  sendMagicLink: (email: string, captchaToken?: string) => Promise<AuthResult>
  /**
   * Invitado → cuenta real por email: `updateUser({ email })` sobre el mismo `user_id`
   * (envía confirmación). No usar `signInWithOtp` aquí: crearía otro usuario y perdería el viaje.
   */
  linkGuestEmail: (email: string, displayName?: string | null) => Promise<AuthResult>
  /**
   * Sincroniza con el servidor tras confirmar el email en otra pestaña.
   * Devuelve `true` si la sesión sigue siendo anónima.
   */
  refreshGuestStatus: () => Promise<boolean>
  signOut: () => Promise<void>
  updateProfile: (data: ProfileInput) => Promise<AuthResult>
}

/** Email pendiente de confirmar tras `updateUser({ email })` (campo `new_email` o `email`). */
function pendingEmailOf(user: User | null | undefined): string | null {
  if (!user) return null
  const candidate = (user.new_email ?? user.email)?.trim()
  return candidate || null
}

const AuthContext = createContext<AuthContextValue | null>(null)

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return "Algo ha fallado. Inténtalo de nuevo."
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured()
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<TravelerProfile | null>(null)
  const [favoriteReferences, setFavoriteReferences] = useState<FavoriteReference[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const loadedProfileFor = useRef<string | null>(null)

  useEffect(() => {
    if (!configured) {
      setIsLoading(false)
      return
    }
    const supabase = createClient()
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setIsLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [configured])

  // Perfil y referencias: se recargan al cambiar de usuario, no en cada refresco de token.
  useEffect(() => {
    if (!configured) return
    const userId = user?.id ?? null
    if (!userId) {
      loadedProfileFor.current = null
      setProfile(null)
      setFavoriteReferences([])
      return
    }
    if (loadedProfileFor.current === userId) return
    loadedProfileFor.current = userId

    const supabase = createClient()
    let active = true
    void (async () => {
      try {
        const [p, refs] = await Promise.all([
          loadProfile(supabase, userId),
          loadFavoriteReferences(supabase, userId),
        ])
        if (!active) return
        setProfile(p)
        setFavoriteReferences(refs)
      } catch {
        if (active) {
          setProfile(null)
          setFavoriteReferences([])
        }
      }
    })()

    return () => {
      active = false
    }
  }, [configured, user?.id])

  const persistProfile = useCallback(
    async (userId: string, data: Partial<ProfileInput>) => {
      const supabase = createClient()
      const hasProfileFields =
        data.displayName !== undefined ||
        data.travelerTypes !== undefined ||
        data.travelerNotes !== undefined

      if (hasProfileFields) {
        const saved = await saveProfile(supabase, userId, {
          displayName: data.displayName ?? null,
          travelerTypes: data.travelerTypes ?? [],
          travelerNotes: data.travelerNotes ?? null,
        })
        setProfile(saved)
      }
      if (data.favoriteReferences !== undefined) {
        const refs = await replaceFavoriteReferences(
          supabase,
          userId,
          data.favoriteReferences,
        )
        setFavoriteReferences(refs)
      }
    },
    [],
  )

  const signIn = useCallback<AuthContextValue["signIn"]>(async (email, password, captchaToken) => {
    if (!configured) return { ok: false, error: "Supabase no está configurado." }
    try {
      // Antes del login: evita que la hidratación del asistente restaure el puntero previo.
      clearActiveConversationPointers()
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined,
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: errorMessage(e) }
    }
  }, [configured])

  const signUp = useCallback<AuthContextValue["signUp"]>(
    async ({ email, password, captchaToken, ...profileData }) => {
      if (!configured) return { ok: false, error: "Supabase no está configurado." }
      try {
        const supabase = createClient()
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            ...(captchaToken ? { captchaToken } : {}),
            data: profileData.displayName
              ? { display_name: profileData.displayName }
              : undefined,
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/auth/callback`
                : undefined,
          },
        })
        if (error) return { ok: false, error: error.message }
        // Sin confirmación por email hay sesión inmediata y podemos guardar el perfil.
        if (data.user && data.session) {
          await persistProfile(data.user.id, profileData)
        }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: errorMessage(e) }
      }
    },
    [configured, persistProfile],
  )

  const upgradeGuest = useCallback<AuthContextValue["upgradeGuest"]>(
    async ({ email, password, ...profileData }) => {
      if (!configured) return { ok: false, error: "Supabase no está configurado." }
      try {
        const supabase = createClient()
        const { data, error } = await supabase.auth.updateUser({
          email,
          password,
          data: profileData.displayName
            ? { display_name: profileData.displayName }
            : undefined,
        })
        if (error) return { ok: false, error: error.message }
        if (data.user) {
          await persistProfile(data.user.id, profileData)
          setUser(data.user)
        }
        // Si el proyecto tiene autoconfirm, el JWT nuevo ya no será anónimo.
        // Si no, seguirá como invitado-pendiente hasta confirmar el email.
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
        if (!refreshError && refreshed.session) {
          setSession(refreshed.session)
          setUser(refreshed.session.user)
        }
        clearStash()
        return { ok: true }
      } catch (e) {
        return { ok: false, error: errorMessage(e) }
      }
    },
    [configured, persistProfile],
  )

  const signInAnonymously = useCallback<AuthContextValue["signInAnonymously"]>(
    async (options) => {
      if (!configured) return { ok: false, error: "Supabase no está configurado." }
      try {
        const supabase = createClient()
        const { error } = await supabase.auth.signInAnonymously({
          options: {
            ...(options?.referrer ? { data: { signup_referrer: options.referrer } } : {}),
            ...(options?.captchaToken ? { captchaToken: options.captchaToken } : {}),
          },
        })
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: errorMessage(e) }
      }
    },
    [configured],
  )

  const sendMagicLink = useCallback<AuthContextValue["sendMagicLink"]>(
    async (email, captchaToken) => {
      if (!configured) return { ok: false, error: "Supabase no está configurado." }
      try {
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            ...(captchaToken ? { captchaToken } : {}),
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/auth/callback`
                : undefined,
          },
        })
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: errorMessage(e) }
      }
    },
    [configured],
  )

  const linkGuestEmail = useCallback<AuthContextValue["linkGuestEmail"]>(
    async (email, displayName) => {
      if (!configured) return { ok: false, error: "Supabase no está configurado." }
      try {
        const supabase = createClient()
        const trimmedName = displayName?.trim() || null
        const { data, error } = await supabase.auth.updateUser({
          email,
          data: trimmedName ? { display_name: trimmedName } : undefined,
        })
        if (error) return { ok: false, error: error.message }
        if (data.user && trimmedName) {
          // Solo el nombre: no pisar traveler_types / notes / favoritos ya guardados.
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert({ id: data.user.id, display_name: trimmedName }, { onConflict: "id" })
          if (!profileError) {
            setProfile((prev) =>
              prev
                ? { ...prev, displayName: trimmedName }
                : {
                    id: data.user!.id,
                    displayName: trimmedName,
                    travelerTypes: [],
                    travelerNotes: null,
                    signupReferrer: null,
                  },
            )
          }
          setUser(data.user)
        } else if (data.user) {
          setUser(data.user)
        }
        clearStash()
        return { ok: true }
      } catch (e) {
        return { ok: false, error: errorMessage(e) }
      }
    },
    [configured],
  )

  const refreshGuestStatus = useCallback<AuthContextValue["refreshGuestStatus"]>(async () => {
    if (!configured) return true
    try {
      const supabase = createClient()
      // getUser() consulta al servidor (no al JWT cacheado).
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) return true

      if (!data.user.is_anonymous) {
        // Acuñar JWT nuevo para que el backend también deje de ver is_anonymous.
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
        if (!refreshError && refreshed.session) {
          setSession(refreshed.session)
          setUser(refreshed.session.user)
          return Boolean(refreshed.session.user.is_anonymous)
        }
        setUser(data.user)
        return false
      }

      // Sigue anónimo: actualizar por si hay new_email / email pendientes.
      setUser(data.user)
      return true
    } catch {
      return true
    }
  }, [configured])

  // Tras confirmar el email en otra pestaña, al volver el foco sincronizamos el JWT.
  useEffect(() => {
    if (!configured) return
    const pendingUpgrade = Boolean(user?.is_anonymous && pendingEmailOf(user))
    if (!pendingUpgrade) return

    const onFocusOrVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      void refreshGuestStatus()
    }

    window.addEventListener("focus", onFocusOrVisible)
    document.addEventListener("visibilitychange", onFocusOrVisible)
    return () => {
      window.removeEventListener("focus", onFocusOrVisible)
      document.removeEventListener("visibilitychange", onFocusOrVisible)
    }
  }, [configured, user, refreshGuestStatus])

  const signOut = useCallback(async () => {
    if (!configured) return
    const supabase = createClient()
    await supabase.auth.signOut()
    clearActiveConversationPointers()
    setProfile(null)
    setFavoriteReferences([])
    loadedProfileFor.current = null
  }, [configured])

  const updateProfile = useCallback<AuthContextValue["updateProfile"]>(
    async (data) => {
      if (!user) return { ok: false, error: "No hay sesión." }
      try {
        await persistProfile(user.id, data)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: errorMessage(e) }
      }
    },
    [persistProfile, user],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      favoriteReferences,
      isLoading,
      isGuest: Boolean(user?.is_anonymous),
      signIn,
      signUp,
      upgradeGuest,
      signInAnonymously,
      sendMagicLink,
      linkGuestEmail,
      refreshGuestStatus,
      signOut,
      updateProfile,
    }),
    [
      user,
      session,
      profile,
      favoriteReferences,
      isLoading,
      signIn,
      signUp,
      upgradeGuest,
      signInAnonymously,
      sendMagicLink,
      linkGuestEmail,
      refreshGuestStatus,
      signOut,
      updateProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
