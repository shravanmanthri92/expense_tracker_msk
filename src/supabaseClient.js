import { createClient } from "@supabase/supabase-js";

// Read credentials from .env (VITE_ prefix exposes them to the browser via Vite)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseMisconfigured = !supabaseUrl || !supabaseAnonKey;

// Create a real client only when credentials are present.
// If missing, export a dummy so the module graph doesn't crash on import —
// the app will show a setup error screen instead of a blank page.
export const supabase = supabaseMisconfigured
  ? /** @type {any} */ ({})
  : createClient(supabaseUrl, supabaseAnonKey);
