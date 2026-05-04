import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const anonKey = process.env.SUPABASE_ANON_KEY || "";

if (!supabaseUrl) {
  console.warn("SUPABASE_URL is not configured.");
}

if (!serviceKey && !anonKey) {
  console.warn("SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY is required.");
}

export const supabase = createClient(supabaseUrl, serviceKey || anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const supabaseAuth = createClient(supabaseUrl, anonKey || serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export async function verifyPropAIToken(token: string) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error(error?.message || "Invalid token");
  }
  return {
    ...data.user,
    broker_id: data.user.id,
  };
}
