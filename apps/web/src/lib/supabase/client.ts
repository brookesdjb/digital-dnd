import { createBrowserClient } from '@supabase/ssr'

declare global {
  interface Window {
    __SUPABASE_URL__: string
    __SUPABASE_ANON_KEY__: string
  }
}

export const createClient = () =>
  createBrowserClient(
    window.__SUPABASE_URL__,
    window.__SUPABASE_ANON_KEY__,
  )
