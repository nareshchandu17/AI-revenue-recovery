"use client"

/**
 * Client-side auth store.
 *
 * Holds the session user returned by /api/auth/me.
 * The merchantId here is display-only — every server action
 * and API route derives merchantId from the HttpOnly session cookie,
 * never from this store.
 */

import { create } from "zustand"

export interface AuthUser {
  userId: string
  merchantId: string
  email: string
  name: string
  role: string
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  initialized: boolean
  setUser: (user: AuthUser | null) => void
  setLoading: (loading: boolean) => void
  setInitialized: (initialized: boolean) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  initialized: false,

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setInitialized: (initialized) => set({ initialized }),

  signOut: async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" })
    } catch {
      // ignore network errors — clear local state regardless
    }
    set({ user: null, initialized: true, loading: false })
  },
}))
