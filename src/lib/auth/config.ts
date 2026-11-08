/**
 * Whether accounts are switched on. They need a Supabase project; until its URL and public
 * (anon) key are set, every auth form says so instead of failing.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const authConfigured = (): boolean => SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
