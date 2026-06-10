export const MCP_PUBLIC_DOCS_URL = "https://www.propai.live/mcp/docs";

export const MCP_CAPABILITIES = [
  "search live broker broadcasts",
  "inspect locality demand gaps",
  "query market pulse metrics",
  "analyze broker network activity",
  "summarize active streams",
] as const;

export const MCP_PUBLIC_TOOLS = [
  {
    name: "search_market_signals",
    description: "Search live broker broadcast streams with locality, intent, and freshness filters.",
  },
  {
    name: "get_locality_pulse",
    description: "Inspect demand, supply, and activity for a locality or market belt.",
  },
  {
    name: "compare_requirement_vs_supply",
    description: "Compare live requirements against active supply in a market slice.",
  },
  {
    name: "summarize_broker_stream",
    description: "Summarize active broker stream activity into a compact intelligence brief.",
  },
] as const;

export const MCP_DEMO_INPUT = {
  locality: "Bandra West",
  intent: "rent",
  budget_max_inr: 125000,
  configuration: "2 BHK",
  freshness: "24h",
};

export const MCP_DEMO_OUTPUT = {
  results: [
    {
      title: "2 BHK for rent in Bandra West",
      locality: "Bandra West",
      price: "₹1.25L/mo",
      freshness: "2h ago",
      confidence: 91,
    },
    {
      title: "3 BHK requirement in Khar West",
      locality: "Khar West",
      price: "Budget up to ₹2.0L/mo",
      freshness: "5h ago",
      confidence: 84,
    },
  ],
  summary: "Live broker-sourced demo output for documentation only.",
};

export const MCP_SECURITY_POINTS = [
  "Production access requires Supabase authentication.",
  "Role-based permissions limit broker-only tools to authorized workspaces.",
  "Token validation is enforced before any private MCP request is processed.",
  "Audit logging records sensitive access attempts and tool usage.",
  "Rate limits protect the private server from abuse or automation spikes.",
  "Data minimization keeps private broker data out of public responses.",
] as const;

export const MCP_MANIFEST = {
  name: "PropAI MCP",
  description: "Private authenticated MCP interface for PropAI Pulse B2B broker network intelligence.",
  public_docs: MCP_PUBLIC_DOCS_URL,
  auth: "Supabase authentication required",
  access: "Private / permissioned",
  capabilities: [
    "market_signal_search",
    "locality_pulse_analysis",
    "demand_supply_gap_detection",
    "broker_stream_summarization",
  ],
  data_policy: "No private broker data is exposed publicly.",
} as const;
