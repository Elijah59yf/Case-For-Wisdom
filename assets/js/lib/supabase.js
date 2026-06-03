// supabase.js — the ONE and only place @supabase/supabase-js is imported on the
// frontend (CLAUDE.md §2 / §13). Loaded lazily by lib/api.js and auth.js, and
// ONLY on the Cloudflare target (Target A) — VPS pages never import this file.
//
// The project URL + anon (publishable) key are injected into every HTML page as
// <meta> tags (CLAUDE.md §4.1); we read them here. The anon key is safe in the
// browser — the security boundary on Target A is Supabase RLS, never this key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function meta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return (el?.getAttribute("content") || "").trim();
}

const SUPABASE_URL = meta("supabase-url");
const SUPABASE_ANON_KEY = meta("supabase-anon");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // This file should only ever load on the Cloudflare target, where the meta
  // tags are present. A missing key here means the page wasn't configured.
  console.error(
    "[supabase] missing <meta name=\"supabase-url\"> / <meta name=\"supabase-anon\"> — " +
    "Supabase calls will fail. Inject the anon keys per CLAUDE.md §4.1."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
