import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "./supabase.js";
import {
  buildBroadcastDraft,
  createRequirementRecord,
  describeSearch,
  estimatePrice,
  getBrokerActivity,
  getFreshStream,
  getIgrPrice,
  getMarketSummary,
  logToolCall,
  qualifyLead,
  saveListingRecord,
  scheduleFollowUp,
  searchPublicListings,
  summarizeThread,
} from "./data.js";
import { listingLine } from "./format.js";
import type { ToolContext } from "./types.js";

export const MCP_TOOL_NAMES = [
  "search_listings",
  "search_requirements",
  "get_igr_price",
  "match_listing_to_requirement",
  "semantic_search",
  "get_fresh_stream",
  "broker_activity",
  "create_requirement",
  "draft_broadcast",
  "market_summary",
  "price_estimate",
  "qualify_lead",
  "save_listing",
  "set_follow_up",
  "summarise_thread",
] as const;

function textResponse(text: string, structured?: unknown) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: structured as Record<string, unknown> | undefined,
  };
}

function brokerId(context?: ToolContext) {
  return context?.user?.broker_id || context?.user?.id;
}

function requireBrokerId(context?: ToolContext) {
  const id = brokerId(context);
  if (!id) {
    throw new Error("Authenticated broker id is required for this tool");
  }
  return id;
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
        "PropAI MCP Server exposes broker workflow tools for searching listings, creating CRM records, scheduling follow-ups, summarizing threads, drafting broadcasts, and checking Maharashtra IGR market intelligence from PropAI's WhatsApp broker network.",
    },
  );

  server.registerTool(
    "broker_activity",
    {
      description:
        "Summarize the broker's recent PropAI activity: lead volume, active chats, follow-up queue, and top localities.",
      inputSchema: {
        days: z.number().default(7).describe("Look back window in days"),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "broker_activity", input);
      const result = await getBrokerActivity({ brokerId: id, days: input.days });
      const topLocalities = result.top_localities.length
        ? result.top_localities.map((item) => `${item.locality} (${item.count})`).join(", ")
        : "none yet";
      const nextFollowUp = result.next_follow_up
        ? `${result.next_follow_up.lead_name || "Unknown lead"} at ${result.next_follow_up.due_at}`
        : "none scheduled";

      return textResponse(
        `Last ${result.days} days: ${result.leads_total} leads (${result.listings_total} listings, ${result.requirements_total} requirements), ${result.messages_total} messages across ${result.active_chats} chats, ${result.pending_follow_ups} pending follow-ups. Next follow-up: ${nextFollowUp}. Top localities: ${topLocalities}.`,
        result,
      );
    },
  );

  server.registerTool(
    "create_requirement",
    {
      description:
        "Create and store a buyer or tenant requirement in the broker's workspace CRM.",
      inputSchema: {
        raw_text: z.string().describe("Original requirement note or message"),
        name: z.string().optional(),
        phone: z.string().optional(),
        budget: z.union([z.string(), z.number()]).optional(),
        location_pref: z.string().optional(),
        timeline: z.string().optional(),
        possession: z.string().optional(),
        bhk_preference: z.array(z.string()).optional(),
        property_type: z.string().optional(),
        listing_type: z.string().optional(),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "create_requirement", input);
      const result = await createRequirementRecord({ brokerId: id, ...input });
      return textResponse(
        `Requirement saved for ${input.location_pref || "the requested location"} with lead id ${result.lead.lead_id}.`,
        result,
      );
    },
  );

  server.registerTool(
    "draft_broadcast",
    {
      description:
        "Draft a broadcast-ready WhatsApp listing message without sending it.",
      inputSchema: {
        title: z.string().optional(),
        location: z.string().optional(),
        bhk: z.string().optional(),
        price: z.string().optional(),
        area_sqft: z.number().optional(),
        furnishing: z.string().optional(),
        contact_name: z.string().optional(),
        contact_number: z.string().optional(),
        notes: z.string().optional(),
        call_to_action: z.string().optional(),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "draft_broadcast", input);
      const message = buildBroadcastDraft(input);
      return textResponse(message, { draft: message });
    },
  );

  server.registerTool(
    "market_summary",
    {
      description:
        "Summarize listing market activity for a locality, city, deal type, or BHK from PropAI's public stream.",
      inputSchema: {
        locality: z.string().optional(),
        city: z.string().optional(),
        property_type: z.enum(["sale", "rent", "lease", "all"]).default("all"),
        bhk: z.number().optional(),
        days: z.number().default(30),
        limit: z.number().default(200),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "market_summary", input);
      const result = await getMarketSummary(input);
      const topLocalities = result.top_localities.length
        ? result.top_localities.map((item) => `${item.locality} (${item.count})`).join(", ")
        : "no strong locality cluster yet";
      return textResponse(
        `Market summary for the last ${result.days} days: ${result.listing_count} comparable listings, average ${result.avg_price_cr != null ? `₹${result.avg_price_cr}Cr` : "price unavailable"}, median ${result.median_price_cr != null ? `₹${result.median_price_cr}Cr` : "price unavailable"}, average ${result.avg_price_per_sqft != null ? `₹${result.avg_price_per_sqft.toLocaleString("en-IN")}/sqft` : "ppsf unavailable"}. Top localities: ${topLocalities}.`,
        result,
      );
    },
  );

  server.registerTool(
    "price_estimate",
    {
      description:
        "Estimate a property's price from public comparables and Maharashtra IGR data.",
      inputSchema: {
        locality: z.string().optional(),
        building_name: z.string().optional(),
        bhk: z.number().optional(),
        area_sqft: z.number().optional(),
        property_type: z.enum(["sale", "rent", "lease", "all"]).default("sale"),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "price_estimate", input);
      const result = await estimatePrice(input);
      return textResponse(result.summary, result);
    },
  );

  server.registerTool(
    "qualify_lead",
    {
      description:
        "Save lead qualification fields like budget, locality, timeline, and possession, and score urgency.",
      inputSchema: {
        raw_text: z.string().describe("Original lead message or qualification note"),
        lead_id: z.string().optional(),
        name: z.string().optional(),
        phone: z.string().optional(),
        budget: z.union([z.string(), z.number()]).optional(),
        location_pref: z.string().optional(),
        timeline: z.string().optional(),
        possession: z.string().optional(),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "qualify_lead", input);
      const result = await qualifyLead({ brokerId: id, ...input });
      return textResponse(
        `Lead qualified with ${result.priority_bucket} priority and ${result.urgency} urgency.`,
        result,
      );
    },
  );

  server.registerTool(
    "save_listing",
    {
      description:
        "Create and store a listing in the broker's workspace CRM.",
      inputSchema: {
        raw_text: z.string().describe("Original listing note or message"),
        name: z.string().optional(),
        phone: z.string().optional(),
        bhk: z.string().optional(),
        location: z.string().optional(),
        price: z.string().optional(),
        carpet_area: z.string().optional(),
        furnishing: z.string().optional(),
        possession_date: z.string().optional(),
        contact_number: z.string().optional(),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "save_listing", input);
      const result = await saveListingRecord({ brokerId: id, ...input });
      return textResponse(
        `Listing saved${result.listing_id ? ` with id ${result.listing_id}` : ""} for ${result.listing.location || "the requested location"}.`,
        result,
      );
    },
  );

  server.registerTool(
    "set_follow_up",
    {
      description:
        "Schedule a callback, visit, or follow-up task for the broker.",
      inputSchema: {
        lead_id: z.string().optional(),
        lead_name: z.string(),
        lead_phone: z.string().optional(),
        due_at: z.string().optional().describe("ISO datetime. Defaults to 24h from now."),
        notes: z.string().optional(),
        action_type: z.enum(["call", "email", "visit"]).default("call"),
        priority_bucket: z.enum(["P1", "P2", "P3"]).optional(),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "set_follow_up", input);
      const result = await scheduleFollowUp({ brokerId: id, ...input });
      return textResponse(
        `Follow-up scheduled for ${input.lead_name} at ${result.due_at}.`,
        result,
      );
    },
  );

  server.registerTool(
    "summarise_thread",
    {
      description:
        "Summarize a WhatsApp thread from stored workspace message history.",
      inputSchema: {
        remote_jid: z.string().describe("Chat JID to summarize"),
        limit: z.number().default(40).describe("How many recent messages to scan"),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "summarise_thread", input);
      const result = await summarizeThread({
        brokerId: id,
        remote_jid: input.remote_jid,
        limit: input.limit,
      });

      if (!result.message_count) {
        return textResponse("No stored thread history found for that chat.", result);
      }

      const participants = result.participants.length ? result.participants.join(", ") : "unknown participants";
      const highlights = result.key_points
        .map((item, index) => `${index + 1}. ${item.sender || "Unknown"}: ${item.text}`)
        .join("\n");

      return textResponse(
        `Thread summary: ${result.message_count} messages (${result.inbound_count} inbound, ${result.outbound_count} outbound) involving ${participants}. Last message at ${result.last_message_at || "unknown time"}.\n\nRecent highlights:\n${highlights}`,
        result,
      );
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
