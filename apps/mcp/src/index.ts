import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "./supabase.js";
import {
  describeSearch,
  getFreshStream,
  getIgrPrice,
  logToolCall,
  searchPublicListings,
} from "./data.js";
import { listingLine } from "./format.js";
import type { ToolContext } from "./types.js";

function textResponse(text: string, structured?: unknown) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: structured as Record<string, unknown> | undefined,
  };
}

function brokerId(context?: ToolContext) {
  return context?.user?.broker_id || context?.user?.id;
}

function noResults(label: string) {
  return textResponse(`No ${label} found for this query. Try widening the locality, budget, BHK, or time window.`, {
    results: [],
  });
}

export function createMcpServer(context: ToolContext = {}) {
  const server = new McpServer(
    {
      name: "propai-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "PropAI MCP Server exposes read-only real estate listings, broker requirements, and Maharashtra IGR market intelligence from PropAI's WhatsApp broker network.",
    },
  );

  server.registerTool(
    "search_listings",
    {
      description:
        "Search real estate listings from PropAI's live WhatsApp stream. Use when someone asks about available properties, flats, offices, or shops in a locality.",
      inputSchema: {
        locality: z.string().describe("Area name e.g. Bandra, Powai, Andheri").optional(),
        city: z.string().describe("City e.g. Mumbai, Pune").optional(),
        property_type: z.enum(["sale", "rent", "lease", "all"]).default("all"),
        bhk: z.number().describe("Number of BHK e.g. 2, 3").optional(),
        max_budget_cr: z.number().describe("Max budget in crores").optional(),
        limit: z.number().default(10),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "search_listings", input);
      const rows = await searchPublicListings({ ...input, listingKind: "listing" });
      if (!rows.length) return noResults("listings");

      const place = [input.locality, input.city].filter(Boolean).join(", ") || "your search";
      const lines = rows.map(listingLine);
      return textResponse(`Found ${rows.length} listings in ${place}:\n\n${lines.join("\n")}`, {
        results: rows,
      });
    },
  );

  server.registerTool(
    "search_requirements",
    {
      description:
        "Find buyer/tenant requirements posted by brokers. Use when someone wants to know what buyers are looking for in a locality.",
      inputSchema: {
        locality: z.string().optional(),
        city: z.string().optional(),
        bhk: z.number().optional(),
        max_budget_cr: z.number().optional(),
        limit: z.number().default(10),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "search_requirements", input);
      const rows = await searchPublicListings({ ...input, listingKind: "requirement" });
      if (!rows.length) return noResults("requirements");

      const summary = describeSearch(input);
      const lines = rows.map(listingLine);
      return textResponse(`Found ${rows.length} buyer/tenant requirements for ${summary}:\n\n${lines.join("\n")}`, {
        results: rows,
      });
    },
  );

  server.registerTool(
    "get_igr_price",
    {
      description:
        "Get last registered transaction price for a building or locality from Maharashtra IGR government records. Use when broker asks about market rate, wants to verify price, or counter a lowball offer.",
      inputSchema: {
        building_name: z.string().optional(),
        locality: z.string().describe("Fallback if building not found").optional(),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "get_igr_price", input);
      if (!input.building_name && !input.locality) {
        return textResponse("Provide a building_name or locality to check Maharashtra IGR prices.");
      }

      const result = await getIgrPrice(input);
      return textResponse(result.summary, result);
    },
  );

  server.registerTool(
    "match_listing_to_requirement",
    {
      description:
        "Find listings that match a specific requirement. Use when broker has a buyer and wants matching properties.",
      inputSchema: {
        locality: z.string().optional(),
        bhk: z.number().optional(),
        budget_min_cr: z.number().optional(),
        budget_max_cr: z.number().optional(),
        property_type: z.enum(["sale", "rent"]).default("sale"),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "match_listing_to_requirement", input);
      const rows = await searchPublicListings({
        ...input,
        max_budget_cr: input.budget_max_cr,
        listingKind: "listing",
        limit: 10,
      });
      if (!rows.length) return noResults("matching listings");

      const summary = describeSearch(input);
      const lines = rows.map(listingLine);
      return textResponse(`Found ${rows.length} matching listings for ${summary}:\n\n${lines.join("\n")}`, {
        results: rows,
      });
    },
  );

  server.registerTool(
    "semantic_search",
    {
      description:
        "Semantically search real estate listings using natural language. Use when someone describes what they want in plain English, e.g. 'a quiet 2BHK near the sea in Bandra with good ventilation under 3Cr'. Finds listings by meaning, not just keyword match.",
      inputSchema: {
        query: z.string().describe("Natural language description of what the user is looking for"),
        locality: z.string().optional(),
        bhk: z.string().optional(),
        type: z.string().optional(),
        threshold: z.number().default(0.55).describe("Similarity threshold (0-1, higher = stricter)"),
        limit: z.number().default(10),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "semantic_search", input);

      // Generate query embedding via the API's embed endpoint
      const apiUrl = process.env.PROPAI_API_URL || "http://localhost:3001";
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
      let embedding: number[];
      try {
        const resp = await fetch(`${apiUrl}/api/scraper/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-service-key": serviceKey },
          body: JSON.stringify({ text: input.query }),
        });
        const data = await resp.json() as any;
        if (!data.success) throw new Error(data.error || "embed failed");
        embedding = data.embedding;
      } catch (e: any) {
        return textResponse(`Could not generate embedding: ${e.message}. Try the search_listings tool instead.`);
      }

      const { data: results, error } = await supabase.rpc("match_listings", {
        query_embedding: embedding,
        match_threshold: input.threshold ?? 0.55,
        match_count: input.limit ?? 10,
        p_tenant_id: null,
        p_locality: input.locality || null,
        p_bhk: input.bhk || null,
        p_type: input.type || null,
      });

      if (error) {
        return textResponse(`Search error: ${error.message}`);
      }

      if (!results || !results.length) {
        return textResponse(`No semantically matching listings found for "${input.query}". Try lowering the threshold or using the search_listings tool for keyword-based search.`, { results: [] });
      }

      const lines = (results as any[]).map((r: any) =>
        `${r.bhk || "?"}BHK ${r.locality || "?"} — ${r.price_label || "?"} (${r.type || "?"}, ${r.furnishing || "?"}) — ${Math.round(r.similarity * 100)}% match`
      );
      return textResponse(`Found ${results.length} semantically matching listings for "${input.query}":\n\n${lines.join("\n")}`, {
        results,
      });
    },
  );

  server.registerTool(
    "get_fresh_stream",
    {
      description:
        "Get the freshest listings and requirements from the last N hours. Use when broker wants to see what's new today.",
      inputSchema: {
        hours: z.number().default(6).describe("Last N hours"),
        city: z.string().optional(),
        limit: z.number().default(20),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "get_fresh_stream", input);
      const rows = await getFreshStream(input);
      if (!rows.length) return noResults(`items from the last ${input.hours ?? 6} hours`);

      const lines = rows.map(listingLine);
      const place = input.city || "all cities";
      return textResponse(`Fresh stream from the last ${input.hours ?? 6} hours in ${place}:\n\n${lines.join("\n")}`, {
        results: rows,
      });
    },
  );

  return server;
}
