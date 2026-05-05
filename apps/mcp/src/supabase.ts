import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const anonKey = process.env.SUPABASE_ANON_KEY || "";
const MCP_CONNECTOR_PROVIDER = "propai_mcp";
const MCP_TOKEN_SECRET_SOURCE =
  process.env.MCP_TOKEN_ENCRYPTION_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.JWT_SECRET ||
  "";

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

function hashMcpConnectorToken(token: string) {
  return `sha256:${crypto.createHash("sha256").update(token).digest("hex")}`;
}

function getMcpTokenSecret() {
  if (!MCP_TOKEN_SECRET_SOURCE) {
    throw new Error("MCP token encryption secret is not configured");
  }

  return crypto.createHash("sha256").update(MCP_TOKEN_SECRET_SOURCE).digest();
}

function decryptMcpConnectorToken(value: string) {
  if (!value.startsWith("enc:")) {
    return null;
  }

  const payload = value.slice(4);
  const [ivPart, tagPart, encryptedPart] = payload.split(".");
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error("Stored MCP token is malformed");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getMcpTokenSecret(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

async function verifyStaticConnectorToken(token: string) {
  const { data: storedKeys, error: keyError } = await supabase
    .from("api_keys")
    .select("tenant_id, key")
    .eq("provider", MCP_CONNECTOR_PROVIDER)
    .limit(1000);

  if (keyError || !storedKeys?.length) {
    throw new Error(keyError?.message || "Invalid token");
  }

  const tokenDigest = hashMcpConnectorToken(token);
  const storedKey = storedKeys.find((candidate) => {
    if (candidate.key === tokenDigest) {
      return true;
    }

    if (typeof candidate.key !== "string" || !candidate.key.startsWith("enc:")) {
      return false;
    }

    try {
      const decryptedToken = decryptMcpConnectorToken(candidate.key);
      return decryptedToken === token;
    } catch {
      return false;
    }
  });

  if (!storedKey?.tenant_id) {
    throw new Error("Invalid token");
  }

  const { data, error } = await supabase.auth.admin.getUserById(storedKey.tenant_id);
  if (error || !data.user) {
    throw new Error(error?.message || "Invalid token");
  }

  return {
    ...data.user,
    broker_id: data.user.id,
  };
}

export async function verifyPropAIToken(token: string) {
  const { data, error } = await supabase.auth.getUser(token);
  if (!error && data.user) {
    return {
      ...data.user,
      broker_id: data.user.id,
    };
  }

  return verifyStaticConnectorToken(token);
}
