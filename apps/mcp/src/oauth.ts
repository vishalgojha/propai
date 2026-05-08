import crypto from "node:crypto";
import type { Request, Response } from "express";
import { supabaseAuth } from "./supabase.js";

type RegisteredClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: "none";
  createdAt: number;
};

type AuthorizationCodeRecord = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  createdAt: number;
};

const registeredClients = new Map<string, RegisteredClient>();
const authorizationCodes = new Map<string, AuthorizationCodeRecord>();
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;

function publicUrl(req: Request) {
  return process.env.MCP_SERVER_URL || `${req.protocol}://${req.get("host")}`;
}

function resourceMetadataUrl(req: Request) {
  return `${publicUrl(req)}/.well-known/oauth-protected-resource`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRegisteredClient(clientId?: string | null) {
  return clientId ? registeredClients.get(String(clientId)) || null : null;
}

function validateRedirectUri(clientId: string, redirectUri: string) {
  const client = getRegisteredClient(clientId);
  if (!client) return true;
  return client.redirectUris.includes(redirectUri);
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
    button { width: 100%; margin-top: 20px; padding: 12px 14px; border: 0; border-radius: 10px; background: #25d366; color: #04120a; font-weight: 700; cursor: pointer; }
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

function pruneAuthorizationCodes() {
  const now = Date.now();
  for (const [code, record] of authorizationCodes.entries()) {
    if (now - record.createdAt > AUTH_CODE_TTL_MS) {
      authorizationCodes.delete(code);
    }
  }
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

export function oauthAuthorizeGetHandler(req: Request, res: Response) {
  const responseType = String(req.query.response_type || "code");
  const clientId = String(req.query.client_id || "");
  const redirectUri = String(req.query.redirect_uri || "");
  const state = String(req.query.state || "");
  const codeChallenge = String(req.query.code_challenge || "");
  const codeChallengeMethod = String(req.query.code_challenge_method || "S256");

  if (responseType !== "code" || !clientId || !redirectUri || !codeChallenge) {
    return res.status(400).send("Invalid OAuth authorization request");
  }

  if (!validateRedirectUri(clientId, redirectUri)) {
    return res.status(400).send("Redirect URI is not allowed for this client");
  }

  return res
    .status(200)
    .setHeader("Content-Type", "text/html; charset=utf-8")
    .send(renderAuthorizePage({
      response_type: responseType,
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
    }));
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

  if (!validateRedirectUri(String(clientId), String(redirectUri))) {
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

  pruneAuthorizationCodes();
  const code = crypto.randomBytes(32).toString("base64url");
  authorizationCodes.set(code, {
    clientId: String(clientId),
    redirectUri: String(redirectUri),
    codeChallenge: String(codeChallenge),
    codeChallengeMethod: String(codeChallengeMethod || "S256"),
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token || null,
    expiresIn: data.session.expires_in || 86400,
    createdAt: Date.now(),
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
  const client: RegisteredClient = {
    clientId,
    clientName: String(req.body?.client_name || "PropAI MCP Client"),
    redirectUris,
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    tokenEndpointAuthMethod: "none",
    createdAt: Date.now(),
  };
  registeredClients.set(clientId, client);

  return res.status(201).json({
    client_id: client.clientId,
    client_id_issued_at: Math.floor(client.createdAt / 1000),
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    grant_types: client.grantTypes,
    response_types: client.responseTypes,
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
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
    pruneAuthorizationCodes();
    const code = String(req.body?.code || "");
    const clientId = String(req.body?.client_id || "");
    const redirectUri = String(req.body?.redirect_uri || "");
    const codeVerifier = String(req.body?.code_verifier || "");

    const record = authorizationCodes.get(code);
    if (!record) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Authorization code is invalid or expired",
      });
    }

    if (record.clientId !== clientId || record.redirectUri !== redirectUri) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Authorization code does not match client or redirect URI",
      });
    }

    if (record.codeChallengeMethod !== "S256" || sha256Base64Url(codeVerifier) !== record.codeChallenge) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "PKCE verification failed",
      });
    }

    authorizationCodes.delete(code);
    return res.json({
      access_token: record.accessToken,
      refresh_token: record.refreshToken,
      token_type: "bearer",
      expires_in: record.expiresIn,
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
