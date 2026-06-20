import { MCP_CAPABILITIES, MCP_PUBLIC_DOCS_URL } from "./mcp";

const publicPages = [
  "https://www.propai.live/",
  "https://www.propai.live/listings",
  "https://www.propai.live/locality/bandra-west",
  "https://www.propai.live/mcp",
  "https://www.propai.live/mcp/docs",
  "https://www.propai.live/mcp/security",
] as const;

export function buildAgentDiscoveryText() {
  const capabilities = MCP_CAPABILITIES.map((item) => `- ${item}`).join("\n");

  return [
    "# PropAI Pulse",
    "",
    "PropAI Pulse is a B2B broker CRM and WhatsApp Business market-intelligence platform.",
    "The public MCP layer documents the concept for crawlers, LLMs, and developer agents.",
    "The private MCP server remains Supabase-authenticated and permissioned.",
    "",
    "## Public docs",
    `- MCP docs: ${MCP_PUBLIC_DOCS_URL}`,
    "- MCP security: https://www.propai.live/mcp/security",
    "- MCP manifest: https://www.propai.live/mcp/manifest",
    "",
    "## What MCP can do at a high level",
    capabilities,
    "",
    "## Public pages",
    ...publicPages.map((page) => `- ${page}`),
    "",
    "## Data policy",
    "- No private broker data is exposed publicly.",
    "- No private tokens, environment variables, or raw signal payloads are exposed here.",
    "- This file documents the public MCP concept only.",
    "",
  ].join("\n");
}
