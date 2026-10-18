/**
 * The team library's Supabase project, from the build's environment: VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY (see .env.example). Unset, the tool runs as it always has, a library per
 * browser, and nothing here is loaded. The anon key is public by design; the database's policies
 * (supabase/migrations) decide what it can reach.
 */
export const TEAM = {
  url: String(import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
  key: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
}
export const teamConfigured = () => !!(TEAM.url && TEAM.key)
