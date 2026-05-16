import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./index.js";
import {
  oauthAuthorizationServerMetadata,
  oauthAuthorizeGetHandler,
  oauthAuthorizePostHandler,
  oauthProtectedResourceMetadata,
  oauthRegisterHandler,
  oauthTokenHandler,
  setMcpUnauthorizedHeaders,
} from "./oauth.js";
import { verifyPropAIToken } from "./supabase.js";
import type { AuthenticatedUser } from "./types.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const app = express();
const PORT = Number(process.env.PORT || 3003);
const PUBLIC_URL = process.env.MCP_SERVER_URL || "https://mcp.propai.live";

type McpSession = {
  server: ReturnType<typeof createMcpServer>;
  transport: StreamableHTTPServerTransport;
};

const sessions = new Map<string, McpSession>();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.header("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version");
  res.header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.head("/", (_req, res) => res.status(200).end());

app.get("/", (_req, res) => {
  res.json({
    name: "PropAI MCP Server",
    version: "1.0.0",
    description: "Real estate listings and intelligence from India WhatsApp broker network",
    transport: "streamable-http",
    endpoint: `${PUBLIC_URL}/mcp`,
  });
});

app.get("/favicon.svg", (_req, res) => {
  // Inline favicon so the MCP service doesn't need static assets.
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  return res.send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="16" fill="#090d12"/>
  <path d="M37 6L18 35h13L27 58l19-29H33L37 6Z" fill="#25d366"/>
  <path d="M37 6L18 35h13L27 58l19-29H33L37 6Z" fill="url(#glow)" opacity="0.18"/>
  <defs>
    <linearGradient id="glow" x1="18" y1="6" x2="46" y2="58" gradientUnits="userSpaceOnUse">
      <stop stop-color="#7CFFB2"/>
      <stop offset="1" stop-color="#25d366"/>
    </linearGradient>
  </defs>
</svg>`,
  );
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "propai-mcp", port: PORT });
});

app.get("/.well-known/mcp-server.json", (_req, res) => {
  res.json({
    name: "PropAI MCP Server",
    version: "1.0.0",
    description: "Real estate listings and intelligence from India WhatsApp broker network",
    endpoints: {
      streamableHttp: `${PUBLIC_URL}/mcp`,
      oauthToken: `${PUBLIC_URL}/oauth/token`,
    },
    auth: {
      type: "bearer",
      token_endpoint: `${PUBLIC_URL}/oauth/token`,
    },
    capabilities: {
      tools: [
        "create_requirement",
        "save_listing",
        "set_follow_up",
        "search_listings",
        "search_requirements",
        "market_summary",
        "broker_activity",
        "price_estimate",
        "get_igr_price",
        "match_listing_to_requirement",
        "get_fresh_stream",
        "draft_broadcast",
        "qualify_lead",
        "summarise_thread",
      ],
    },
  });
});

app.get("/.well-known/oauth-authorization-server", oauthAuthorizationServerMetadata);
app.get("/.well-known/oauth-protected-resource", oauthProtectedResourceMetadata);
app.get("/authorize", oauthAuthorizeGetHandler);
app.post("/authorize", oauthAuthorizePostHandler);
app.post("/oauth/token", oauthTokenHandler);
app.post("/register", oauthRegisterHandler);

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!token) {
    setMcpUnauthorizedHeaders(req, res);
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    req.user = await verifyPropAIToken(token);
    return next();
  } catch {
    setMcpUnauthorizedHeaders(req, res);
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.all("/mcp", authMiddleware, async (req: Request, res: Response) => {
  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionId = req.headers["mcp-session-id"];
  let session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;

  if (!session) {
    const server = createMcpServer({ user: req.user });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (newSessionId) => {
        sessions.set(newSessionId, { server, transport });
      },
      onsessionclosed: async (closedSessionId) => {
        const closedSession = sessions.get(closedSessionId);
        sessions.delete(closedSessionId);
        await closedSession?.server.close();
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    session = { server, transport };
    await server.connect(transport);
  }

  try {
    await session.transport.handleRequest(req, res, req.method === "POST" ? req.body : undefined);
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

async function closeSessions() {
  await Promise.all(
    [...sessions.values()].map(async (session) => {
      await session.transport.close();
      await session.server.close();
    }),
  );
}

process.on("SIGTERM", async () => {
  await closeSessions();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await closeSessions();
  process.exit(0);
});

const httpServer = app.listen(PORT, () => {
  console.log(`PropAI MCP server running on port ${PORT}`);
});

httpServer.on("error", (error) => {
  console.error("Failed to start PropAI MCP server:", error);
  process.exit(1);
});
