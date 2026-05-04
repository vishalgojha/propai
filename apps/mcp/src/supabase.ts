import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const anonKey = process.env.SUPABASE_ANON_KEY || "";

function missingClient(name: string) {
  return new Proxy({}, {
    get() {
      throw new Error(`${name} is not configured. Set SUPABASE_URL and a Supabase API key.`);
    },
  }) as ReturnType<typeof createClient>;
}

function buildClient(key: string, name: string) {
  if (!supabaseUrl || !key) {
    console.warn(`${name} is not configured. Set SUPABASE_URL and a Supabase API key.`);
    return missingClient(name);
  }

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: ws as any,
    } as any,
  });
}

export const supabase = buildClient(serviceKey || anonKey, "PropAI MCP Supabase service client");

export const supabaseAuth = buildClient(anonKey || serviceKey, "PropAI MCP Supabase auth client");

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
