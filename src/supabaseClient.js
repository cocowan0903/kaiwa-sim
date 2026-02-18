// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta?.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta?.env?.VITE_SUPABASE_ANON_KEY;

// env無い場合は Supabase無効
let supabase = null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Supabase disabled: env missing", {
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey ? "(set)" : supabaseAnonKey,
  });
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };

const LS_USER_KEY = "dr:local_user_id_v1";

export function getOrCreateLocalUserId() {
  try {
    let id = localStorage.getItem(LS_USER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(LS_USER_KEY, id);
    }
    return id;
  } catch {
    return "local_fallback";
  }
}
