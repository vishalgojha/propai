import crypto from "node:crypto";
import type { Request, Response } from "express";
import {
  createOAuthClient,
  deleteAuthorizationCode,
  getAuthorizationCode,
  getOAuthClient,
  pruneAuthorizationCodes,
  saveAuthorizationCode,
} from "./oauthStore.js";
import { supabaseAuth } from "./supabase.js";
import { activationCodeService } from "../services/activationCodeService";
import { createAppSessionToken, getAppSessionExpiryMs, getAppSessionTtlSeconds } from "../services/appAuthTokenService";
import { createAppRefreshToken, rotateAppRefreshToken, isAppRefreshToken } from "../services/appRefreshTokenService";
import { getProfileById } from "../services/authSession";
import { getBrokerIdentityById } from "../services/identityService";
import { normalizePhone } from "../services/phoneOwnershipService";
import { whatsappService } from "./services/whatsappService";

// Device code flow constants
const DEVICE_CODE_EXPIRY_SECONDS = 900; // 15 minutes
const DEVICE_CODE_INTERVAL_SECONDS = 5; // polling interval
const DEVICE_CODE_LENGTH = 8;
const DEVICE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEVICE_CODE_PREFIX = "PROP-";

function publicUrl(req: Request) {
  return process.env.MCP_SERVER_URL || `${req.protocol}://${req.get("host")}`;
}

// Generate a device code similar to activation codes
function generateDeviceCode(): string {
  let result = '';
  for (let i = 0; i < DEVICE_CODE_LENGTH; i++) {
    result += DEVICE_CODE_CHARS.charAt(Math.floor(Math.random() * DEVICE_CODE_CHARS.length));
  }
  return `${DEVICE_CODE_PREFIX}${result}`;
}

// In-memory store for device codes (in production, use Redis or database)
interface DeviceCodeRecord {
  device_code: string;
  user_code: string;
  client_id: string;
  expires_at: string;
  interval: number;
  // Optional fields for when authorized
  user_id?: string;
  phone_number?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  authorized_at?: string;
}

// Simple in-memory store - replace with Redis/DB in production
const deviceCodeStore = new Map<string, DeviceCodeRecord>();

function storeDeviceCode(record: DeviceCodeRecord) {
  deviceCodeStore.set(record.device_code, {
    ...record,
    expires_at: new Date(Date.now() + DEVICE_CODE_EXPIRY_SECONDS * 1000).toISOString(),
  });
}

function getDeviceCode(device_code: string): DeviceCodeRecord | undefined {
  const record = deviceCodeStore.get(device_code);
  if (!record) return undefined;
  
  // Check if expired
  if (new Date(record.expires_at) < new Date()) {
    deviceCodeStore.delete(device_code);
    return undefined;
  }
  
  return record;
}

function deleteDeviceCode(device_code: string) {
  deviceCodeStore.delete(device_code);
}

function cleanExpiredDeviceCodes() {
  const now = new Date();
  for (const [device_code, record] of deviceCodeStore.entries()) {
    if (new Date(record.expires_at) < now) {
      deviceCodeStore.delete(device_code);
    }
  }
}

function resourceMetadataUrl(req: Request) {
  return `${publicUrl(req)}/.well-known/oauth-protected-resource`;
}

// Device Code Flow Constants
const DEVICE_CODE_EXPIRY_CODE_EXPIRY_SECONDS = 900; // 15 minutes
const DEVICE_CODE_INTERVAL_SECONDS = 5; // polling interval
const DEVICE_CODE_LENGTH = 8;
const DEVICE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEVICE_CODE_PREFIX = "PROP-";

// Device code flow interfaces
interface DeviceCodeRecord {
  device_code: string;
  user_code: string;
  client_id: string;
  expires_at: string;
  interval: number;
  // Optional fields for when authorized
  user_id?: string;
  phone_number?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  authorized_at?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  redirect_uri?: string;
  state?: string;
}

// Simple in-memory store - replace with Redis/DB in production
const deviceCodeStore = new Map<string, DeviceCodeRecord>();

function storeDeviceCode(record: DeviceCodeRecord) {
  deviceCodeStore.set(record.device_code, {
    ...record,
    expires_at: new Date(Date.now() + DEVICE_CODE_EXPIRY_SECONDS * 1000).toISOString(),
  });
}

function getDeviceCode(device_code: string): DeviceCodeRecord | undefined {
  const record = deviceCodeStore.get(device_code);
  if (!record) return undefined;
  
  // Check if expired
  if (new Date(record.expires_at) < new Date()) {
    deviceCodeStore.delete(device_code);
    return undefined;
  }
  
  return record;
}

function deleteDeviceCode(device_code: string) {
  deviceCodeStore.delete(device_code);
}

function cleanExpiredDeviceCodes() {
  const now = new Date();
  for (const [device_code, record] of deviceCodeStore.entries()) {
    if (new Date(record.expires_at) < now) {
      deviceCodeStore.delete(device_code);
    }
  }
}

// Generate a device code similar to activation codes
function generateDeviceCode(): string {
  let result = '';
  for (let i = 0; i < DEVICE_CODE_LENGTH; i++) {
    result += DEVICE_CODE_CHARS.charAt(Math.floor(Math.random() * DEVICE_CODE_CHARS.length));
  }
  return `${DEVICE_CODE_PREFIX}${result}`;
}

// Device Code Flow Endpoints (RFC 8628)
// POST /device-code - generates device and user codes
export async function handleDeviceCodeRequest(req: Request, res: Response) {
  const clientId = String(req.body?.client_id || "");
  const scopes = Array.isArray(req.body?.scope) ? req.body.scope : [String(req.body?.scope || "")];

  if (!clientId) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "client_id is required",
    });
  }

  // Validate client exists
  const client = await getOAuthClient(clientId);
  if (!client) {
    return res.status(401).json({
      error: "invalid_client",
      error_description: "Client not found",
    });
  }

  // Generate device code and user code
  const device_code = generateDeviceCode();
  const user_code = device_code; // Use same value for simplicity

  // Store device code
  const deviceCodeRecord: DeviceCodeRecord = {
    device_code,
    user_code,
    client_id,
    expires_at: new Date(Date.now() + DEVICE_CODE_EXPIRY_SECONDS * 1000).toISOString(),
    interval: DEVICE_CODE_INTERVAL_SECONDS,
  };
  storeDeviceCode(deviceCodeRecord);

  // TODO: Get user's phone number from their profile/client context
  // For now, we'll simulate sending or attempt to send via our API service
  
  // Attempt to send the code via WhatsApp
  try {
    // In a real implementation, we would get the user's phone number from their profile
    // For now, we'll use a placeholder or simulate
    const placeholderPhoneNumber = "+919999999999"; // This would come from user profile
    
    // Try to send via our WhatsApp service
    const sent = await whatsappService.sendVerificationCode(
      placeholderPhoneNumber, 
      user_code
    );
    
    if (sent) {
      console.log(`[MCP] Sent verification code ${user_code} via WhatsApp`);
    } else {
      console.log(`[MCP] Failed to send WhatsApp message, falling back to simulation`);
      // Fall back to logging what we would send
      console.log(`[MCP SIMULATION] Would send WhatsApp message to ${placeholderPhoneNumber}: Your PropAI MCP code is: ${user_code}`);
    }
  } catch (error) {
    console.error('Error attempting to send WhatsApp message:', error);
    // Fall back to logging what we would send
    console.log(`[MCP SIMULATION] Would send WhatsApp message: Your PropAI MCP code is: ${user_code}`);
  }

  return res.json({
    device_code,
    user_code,
    verification_uri: "https://app.propai.live/mcp-authorize", // Point to our auth page
    verification_uri_complete: `https://app.propai.live/mcp-authorize?user_code=${user_code}`, // For QR code etc.
    expires_in: DEVICE_CODE_EXPIRY_SECONDS,
    interval: DEVICE_CODE_INTERVAL_SECONDS,
  });
}

// POST /token - device code polling endpoint
export async function handleDeviceTokenRequest(req: Request, res: Response) {
  const grantType = String(req.body?.grant_type || "");
  const deviceCode = String(req.body?.device_code || "");

  if (grantType !== "urn:ietf:params:oauth:grant-type:device_code") {
    return res.status(400).json({
      error: "unsupported_grant_type",
      error_description: `Unsupported grant type: ${grantType}`,
    });
  }

  if (!deviceCode) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "device_code is required",
    });
  }

  // Get device code record
  const deviceCodeRecord = getDeviceCode(deviceCode);
  if (!deviceCodeRecord) {
    return res.status(400).json({
      error: "invalid_grant",
      error_description: "Device code is expired or invalid",
    });
  }

  // Check if device code has been authorized (user completed WhatsApp flow)
  if (deviceCodeRecord.user_id && deviceCodeRecord.access_token) {
    // Clean up used device code
    deleteDeviceCode(deviceCode);

    return res.json({
      access_token: deviceCodeRecord.access_token,
      refresh_token: deviceCodeRecord.refresh_token,
      token_type: "bearer",
      expires_in: deviceCodeRecord.expires_in,
    });
  }

  // Check if expired
  if (new Date(deviceCodeRecord.expires_at) < new Date()) {
    deleteDeviceCode(deviceCode);
    return res.status(400).json({
      error: "expired_token",
      error_description: "Device code has expired",
    });
  }

  // Still pending - user hasn't completed WhatsApp verification yet
  return res.status(400).json({
    error: "authorization_pending",
    error_description: "Authorization request is still pending",
    interval: deviceCodeRecord.interval,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function validateRedirectUri(clientId: string, redirectUri: string) {
  const client = await getOAuthClient(clientId);
  if (!client) return true;
  return client.redirect_uris.includes(redirectUri);
}

function sha256Base64Url(value: string) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function renderAuthorizePage(params: Record<string, string>, error?: string) {
  const hidden = Object.entries(params)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PropAI MCP Authorization</title>
  <style>
    body { font-family: Arial, sans-serif; background: #081018; color: #fff; margin: 0; }
    .wrap { max-width: 420px; margin: 8vh auto; padding: 24px; background: #101923; border: 1px solid #223243; border-radius: 16px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { color: #9eb0c1; line-height: 1.5; }
    label { display: block; margin-top: 16px; font-size: 14px; color: #d7e1ea; }
    input { width: 100%; margin-top: 8px; padding: 12px 14px; border-radius: 10px; border: 1px solid #314558; background: #0c141d; color: #fff; box-sizing: border-box; }
    button { width: 100%; margin-top: 20px; padding: 12px 14px; border: 0; border-radius: 10px; background: #3EE88A; color: #04120a; font-weight: 700; cursor: pointer; }
    .error { margin-top: 12px; color: #ff9b9b; }
    .hint { font-size: 12px; color: #7f93a6; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Authorize PropAI MCP</h1>
    <p>Sign in with your PropAI account to connect this MCP server.</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <form method="post" action="/authorize">
      ${hidden}
      <label>Email
        <input type="email" name="email" autocomplete="username" required />
      </label>
      <label>Password
        <input type="password" name="password" autocomplete="current-password" required />
      </label>
      <button type="submit">Authorize</button>
    </form>
    <div class="hint">This grants the MCP client access using your PropAI account.</div>
  </div>
</body>
</html>`;
}

export function oauthAuthorizationServerMetadata(req: Request, res: Response) {
  const issuer = publicUrl(req);
  return res.json({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp"],
  });
}

export function oauthProtectedResourceMetadata(req: Request, res: Response) {
  const issuer = publicUrl(req);
  return res.json({
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
  });
}

export async function oauthAuthorizeGetHandler(req: Request, res: Response) {
  // Initiate device code flow instead of showing login form
  const responseType = String(req.query.response_type || "code");
  const clientId = String(req.query.client_id || "");
  const redirectUri = String(req.query.redirect_uri || "");
  const state = String(req.query.state || "");
  const codeChallenge = String(req.query.code_challenge || "");
  const codeChallengeMethod = String(req.query.code_challenge_method || "S256");

  if (responseType !== "code" || !clientId || !redirectUri || !codeChallenge) {
    return res.status(400).send("Invalid OAuth authorization request");
  }

  if (!(await validateRedirectUri(clientId, redirectUri))) {
    return res.status(400).send("Redirect URI is not allowed for this client");
  }

  // Generate device code for MCP authentication via WhatsApp
  const deviceCode = generateDeviceCode(); // e.g., "PROP-ABCD1234"
  const userCode = deviceCode; // Same as device code for simplicity
  
  // Store device code record
  const deviceCodeRecord: DeviceCodeRecord = {
    device_code: deviceCode,
    user_code: userCode,
    client_id: clientId,
    expires_at: new Date(Date.now() + DEVICE_CODE_EXPIRY_SECONDS * 1000).toISOString(),
    interval: DEVICE_CODE_INTERVAL_SECONDS,
  };
  
  storeDeviceCode(deviceCodeRecord);

  // Return device code response (RFC 8628)
  return res.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: "https://app.propai.live/mcp-authorize", // Instruction page
    verification_uri_complete: `https://app.propai.live/mcp-authorize?user_code=${userCode}`,
    expires_in: DEVICE_CODE_EXPIRY_SECONDS,
    interval: DEVICE_CODE_INTERVAL_SECONDS,
  });
}

export async function oauthAuthorizePostHandler(req: Request, res: Response) {
  const {
    email,
    password,
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod = "S256",
  } = req.body ?? {};

  if (!email || !password || !clientId || !redirectUri || !codeChallenge) {
    return res.status(400).send("Missing required OAuth authorization fields");
  }

  if (!(await validateRedirectUri(String(clientId), String(redirectUri)))) {
    return res.status(400).send("Redirect URI is not allowed for this client");
  }

  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password: String(password),
  });

  if (error || !data.session) {
    return res
      .status(401)
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .send(renderAuthorizePage({
        response_type: "code",
        client_id: String(clientId),
        redirect_uri: String(redirectUri),
        state: String(state || ""),
        code_challenge: String(codeChallenge),
        code_challenge_method: String(codeChallengeMethod || "S256"),
      }, error?.message || "Invalid credentials"));
  }

  await pruneAuthorizationCodes();

  const existingClient = await getOAuthClient(String(clientId));
  if (!existingClient) {
    await createOAuthClient({
      client_id: String(clientId),
      client_name: String(req.body?.client_name || "PropAI MCP Client"),
      redirect_uris: [String(redirectUri)],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      created_at: new Date().toISOString(),
    });
  }

  const code = crypto.randomBytes(32).toString("base64url");
  await saveAuthorizationCode({
    code,
    client_id: String(clientId),
    redirect_uri: String(redirectUri),
    code_challenge: String(codeChallenge),
    code_challenge_method: String(codeChallengeMethod || "S256"),
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token || null,
    expires_in: data.session.expires_in || 86400,
    created_at: new Date().toISOString(),
  });

  const target = new URL(String(redirectUri));
  target.searchParams.set("code", code);
  if (state) {
    target.searchParams.set("state", String(state));
  }

  return res.redirect(target.toString());
}

export async function oauthRegisterHandler(req: Request, res: Response) {
  const redirectUris = Array.isArray(req.body?.redirect_uris)
    ? req.body.redirect_uris.map((entry: unknown) => String(entry))
    : [];

  if (!redirectUris.length) {
    return res.status(400).json({
      error: "invalid_client_metadata",
      error_description: "redirect_uris is required",
    });
  }

  const clientId = crypto.randomUUID();
  const client = {
    client_id: clientId,
    client_name: String(req.body?.client_name || "PropAI MCP Client"),
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none" as const,
    created_at: new Date().toISOString(),
  };
  await createOAuthClient(client);

  return res.status(201).json({
    client_id: client.client_id,
    client_id_issued_at: Math.floor(new Date(client.created_at).getTime() / 1000),
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    grant_types: client.grant_types,
    response_types: client.response_types,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
  });
}

export async function oauthTokenHandler(req: Request, res: Response) {
  const grantType = String(req.body?.grant_type || "");

  // Backward-compatible direct credential exchange.
  if (!grantType) {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "email and password are required",
      });
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password: String(password),
    });

    if (error || !data.session) {
      return res.status(401).json({
        error: "invalid_grant",
        error_description: error?.message || "Invalid credentials",
      });
    }

    return res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: "bearer",
      expires_in: data.session.expires_in || 86400,
    });
  }

  if (grantType === "authorization_code") {
    await pruneAuthorizationCodes();
    const code = String(req.body?.code || "");
    const clientId = String(req.body?.client_id || "");
    const redirectUri = String(req.body?.redirect_uri || "");
    const codeVerifier = String(req.body?.code_verifier || "");

    const record = await getAuthorizationCode(code);
    if (!record) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Authorization code is invalid or expired",
      });
    }

    if (record.client_id !== clientId || record.redirect_uri !== redirectUri) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Authorization code does not match client or redirect URI",
      });
    }

    if (record.code_challenge_method !== "S256" || sha256Base64Url(codeVerifier) !== record.code_challenge) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "PKCE verification failed",
      });
    }

    await deleteAuthorizationCode(code);
    return res.json({
      access_token: record.access_token,
      refresh_token: record.refresh_token,
      token_type: "bearer",
      expires_in: record.expires_in,
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(req.body?.refresh_token || "");
    if (!refreshToken) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "refresh_token is required",
      });
    }

    const { data, error } = await supabaseAuth.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      return res.status(401).json({
        error: "invalid_grant",
        error_description: error?.message || "Refresh token is invalid",
      });
    }

    return res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: "bearer",
      expires_in: data.session.expires_in || 86400,
    });
  }

  return res.status(400).json({
    error: "unsupported_grant_type",
    error_description: `Unsupported grant type: ${grantType}`,
  });
}

export function setMcpUnauthorizedHeaders(req: Request, res: Response) {
  res.setHeader("WWW-Authenticate", `Bearer resource_metadata=\"${resourceMetadataUrl(req)}\"`);
}

// MCP Authorization Endpoint - Handles device code verification via WhatsApp
// GET /mcp-authorize - Shows instructions to user
// POST /mcp-authorize - Handles code submission from user
export async function mcpAuthorizeHandler(req: Request, res: Response) {
  if (req.method === 'GET') {
    // Show instructions for user to complete authorization via WhatsApp
    const userCode = String(req.query?.user_code || '');
    
    if (!userCode) {
      return res.status(400).send('Missing user_code parameter');
    }

    // Find the device code record by user_code
    let deviceCodeRecord: DeviceCodeRecord | undefined;
    for (const record of deviceCodeStore.values()) {
      if (record.user_code === userCode) {
        deviceCodeRecord = record;
        break;
      }
    }

    if (!deviceCodeRecord) {
      return res.status(404).send('Invalid or expired user code');
    }

    // Check if already completed
    if (deviceCodeRecord.user_id && deviceCodeRecord.access_token) {
      // Already authorized, redirect to client with auth code
      const authCode = crypto.randomBytes(32).toString("base64url");
      await saveAuthorizationCode({
        code: authCode,
        client_id: deviceCodeRecord.client_id,
        redirect_uri: "https://app.propai.live/mcp/callback", // MCP callback
        code_challenge: deviceCodeRecord.code_challenge || "",
        code_challenge_method: deviceCodeRecord.code_challenge_method || "S256",
        access_token: deviceCodeRecord.access_token,
        refresh_token: deviceCodeRecord.refresh_token,
        expires_in: deviceCodeRecord.expires_in || 86400,
        created_at: new Date().toISOString(),
      });

      // Redirect to MCP callback with auth code
      const redirectUrl = new URL("https://app.propai.live/mcp/callback");
      redirectUrl.searchParams.set("code", authCode);
      if (deviceCodeRecord.state) {
        redirectUrl.searchParams.set("state", deviceCodeRecord.state);
      }
      return res.redirect(redirectUrl.toString());
    }

    // Show instructions page
    return res
      .status(200)
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PropAI MCP Authorization</title>
  <style>
    body { font-family: Arial, sans-serif; background: #081018; color: #fff; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .wrap { max-width: 420px; margin: 0 auto; padding: 24px; background: #101923; border: 1px solid #223243; border-radius: 16px; width: 90%; }
    h1 { margin: 0 0 8px; font-size: 24px; text-align: center; }
    .code { display: block; margin: 20px 0; padding: 15px; background: #0c141d; border: 2px dashed #3EE88A; border-radius: 12px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 2px; color: #3EE88A; }
    .instruction { margin: 15px 0; padding: 12px; background: #0c141d; border-radius: 10px; font-size: 16px; line-height: 1.5; }
    .footer { margin-top: 20px; font-size: 14px; color: #9eb0c1; text-align: center; }
    .countdown { font-family: monospace; font-size: 18px; color: #ff9b9b; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>PropAI MCP Authorization</h1>
    <div class="code">${userCode}</div>
    <div class="instruction">
      <strong>Step 1:</strong> Open WhatsApp on your phone<br>
      <strong>Step 2:</strong> Send this exact code to PropAI Assistant (+91 7021045254)<br>
      <strong>Step 3:</strong> Wait for confirmation - we'll detect your message and complete the authorization
    </div>
    <div class="countdown" id="countdown">Waiting for verification...</div>
    <div class="footer">
      This code will expire in <span id="expires-in">${Math.floor((new Date(deviceCodeRecord.expires_at).getTime() - Date.now()) / 1000)}</span> seconds<br>
      <span id="status">Waiting for WhatsApp message...</span>
    </div>
  </div>
  <script>
    const expiresAt = new Date("${deviceCodeRecord.expires_at}").getTime();
    const startTime = Date.now();
    
    function updateCountdown() {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      document.getElementById('expires-in').textContent = String(remaining);
      
      if (remaining <= 0) {
        document.getElementById('status').textContent = 'Code expired - please request a new one';
        clearInterval(timer);
        return;
      }
      
      // Poll for completion every 3 seconds
      if (Math.floor((now - startTime) / 3000) !== Math.floor((now - 3000 - startTime) / 3000)) {
        fetch('/mcp-authorize/check?user_code=${encodeURIComponent(userCode)}', {
          method: 'GET',
          credentials: 'include'
        })
        .then(response => response.json())
        .then(data => {
          if (data.authorized) {
            document.getElementById('status').textContent = 'Authorization successful! Redirecting...';
            // Redirect to the callback URL that would have been provided in the original request
            // In a real implementation, we'd store the redirect_uri from the device code request
            window.location.href = '/mcp/success'; // Placeholder - would redirect to client
          } else if (data.error === 'expired') {
            document.getElementById('status').textContent = 'Code expired';
            clearInterval(timer);
          }
        })
        .catch(err => {
          console.error('Polling error:', err);
        });
      }
    }
    
    const timer = setInterval(updateCountdown, 1000);
    updateCountdown(); // Initial call
  </script>
</body>
</html>`);
  } else if (req.method === 'POST') {
    // Handle code submission from user (simulating WhatsApp webhook callback)
    // In reality, this would be called by the WhatsApp webhook when a message arrives
    // But for simplicity in this implementation, we'll allow direct POST for testing
    
    const { user_code: userCode } = req.body;
    
    if (!userCode) {
      return res.status(400).json({ error: 'user_code is required' });
    }

    // Find the device code record by user_code
    let deviceCodeRecord: DeviceCodeRecord | undefined;
    for (const record of deviceCodeStore.values()) {
      if (record.user_code === userCode) {
        deviceCodeRecord = record;
        break;
      }
    }

    if (!deviceCodeRecord) {
      return res.status(404).json({ error: 'Invalid or expired user code' });
    }

    // Check if expired
    if (new Date(deviceCodeRecord.expires_at) < new Date()) {
      deviceCodeStore.delete(deviceCodeRecord.device_code);
      return res.status(400).json({ error: 'Code has expired' });
    }

    // In a real implementation, we would:
    // 1. Wait for WhatsApp webhook to receive message with this code from user's phone
    // 2. Verify the phone number matches the user's registered number
    // 3. Activate the code in the activationCodeService
    // 4. Then mark the device code as authorized
    
    // For this implementation, we'll simulate by checking if the code has been activated
    // via the WhatsApp flow (same as web login)
    
    // Check if there's an activated code for this user code that matches a phone number
    // This simulates the WhatsApp verification process
    
    // Since we can't actually receive WhatsApp messages here without the webhook setup,
    // we'll implement a simplified version: if the code exists in activationCodeService as activated, consider it verified
    
    // For demo/testing purposes, we'll allow direct verification in development
    // In production, this would only happen via the actual WhatsApp webhook
    
    if (process.env.NODE_ENV === 'development') {
      // In dev mode, allow direct verification for testing
      deviceCodeRecord.user_id = "dev-user-id"; // Would be set from actual validation
      deviceCodeRecord.phone_number = "+919999999999"; // Would be actual phone number
      
      // Create session tokens (same as web login flow)
      const sessionToken = createAppSessionToken({
        userId: deviceCodeRecord.user_id,
        email: `user${deviceCodeRecord.user_id}@propai.live`,
        phone: deviceCodeRecord.phone_number,
        fullName: "Test User",
        appRole: "broker",
      });
      
      const appRefresh = createAppRefreshToken({
        userId: deviceCodeRecord.user_id,
        userAgent: req.get('user-agent') || 'MCP-Client',
        ipAddress: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']) : req.ip || '127.0.0.1',
      });
      
      deviceCodeRecord.access_token = sessionToken;
      deviceCodeRecord.refresh_token = appRefresh.refreshToken;
      deviceCodeRecord.expires_in = getAppSessionTtlSeconds();
      deviceCodeRecord.authorized_at = new Date().toISOString();
      
      return res.json({ success: true, message: 'Code verified (development mode)' });
    }
    
    // In production, we would return pending and wait for actual WhatsApp webhook
    // to activate the code through the normal activationCodeService flow
    return res.status(202).json({ 
      message: 'Code received. Waiting for WhatsApp verification...', 
      status: 'pending' 
    });
  } else if (req.method === 'GET' && req.path.includes('/check')) {
    // Polling endpoint for JavaScript to check if authorization is complete
    const userCode = String(req.query?.user_code || '');
    
    if (!userCode) {
      return res.status(400).json({ error: 'user_code is required' });
    }

    // Find the device code record by user_code
    let deviceCodeRecord: DeviceCodeRecord | undefined;
    for (const record of deviceCodeStore.values()) {
      if (record.user_code === userCode) {
        deviceCodeRecord = record;
        break;
      }
    }

    if (!deviceCodeRecord) {
      return res.status(404).json({ error: 'Invalid or expired user code' });
    }

    // Check if expired
    if (new Date(deviceCodeRecord.expires_at) < new Date()) {
      deviceCodeStore.delete(deviceCodeRecord.device_code);
      return res.json({ authorized: false, error: 'expired' });
    }

    // Check if authorized (has user_id and access_token)
    if (deviceCodeRecord.user_id && deviceCodeRecord.access_token) {
      return res.json({ authorized: true });
    }

    // Still pending
    return res.json({ authorized: false });
  } else {
    return res.status(405).send('Method not allowed');
  }
}
