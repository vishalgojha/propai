import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "./supabase.js";
import {
  createRequirementRecord,
  describeSearch,
  ensurePaidWorkspace,
  getFreshStream,
  getBrokerActivityGaps,
  getIgrPrice,
  getMarketSummary,
  estimatePriceRange,
  logToolCall,
  saveListingRecord,
  searchPublicListings,
  setFollowUpTask,
} from "./data.js";
import { formatCurrencyCr, formatPerSqft, listingLine } from "./format.js";
import { generateAiJson } from "./ai.js";
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

type LeadQualification = {
  intent: "HOT" | "WARM" | "COLD";
  score: number;
  suggested_next_action: string;
};

async function requirePaidAccess(context: ToolContext) {
  const result = await ensurePaidWorkspace(brokerId(context));
  if (!result.allowed) {
    return textResponse(result.message || "Paid workspace required.");
  }
  return null;
}

function heuristicLeadQualification(conversationText: string): LeadQualification {
  const text = conversationText.toLowerCase();
  const hotSignals = ["site visit", "token", "close", "final", "ready", "today", "tomorrow", "share location", "send papers"];
  const warmSignals = ["interested", "budget", "details", "available", "price", "photos", "floor plan", "call me"];
  const coldSignals = ["later", "not now", "maybe", "just checking", "brochure", "will revert"];

  const hotCount = hotSignals.filter((signal) => text.includes(signal)).length;
  const warmCount = warmSignals.filter((signal) => text.includes(signal)).length;
  const coldCount = coldSignals.filter((signal) => text.includes(signal)).length;

  if (hotCount >= 2 || (hotCount >= 1 && warmCount >= 1)) {
    return { intent: "HOT", score: Math.min(10, 7 + hotCount + warmCount), suggested_next_action: "Call immediately and lock a site visit or negotiation step." };
  }
  if (warmCount >= 1 || hotCount >= 1) {
    return { intent: "WARM", score: Math.min(10, 4 + warmCount + hotCount), suggested_next_action: "Send a focused shortlist and schedule a follow-up call within 24 hours." };
  }
  return { intent: "COLD", score: Math.max(1, 3 - coldCount), suggested_next_action: "Keep the lead warm with one concise follow-up and avoid over-chasing." };
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
        "PropAI MCP Server exposes PropAI brokerage workflows, listings, requirements, follow-ups, and Maharashtra IGR market intelligence from PropAI's WhatsApp broker network.",
    },
  );

  server.registerTool(
    "create_requirement",
    {
      description:
        "Create and save a broker requirement in the PropAI workspace CRM. Paid workspaces only.",
      inputSchema: {
        locality: z.string(),
        bhk: z.number(),
        budget_min_cr: z.number(),
        budget_max_cr: z.number(),
        property_type: z.string(),
        notes: z.string().optional(),
        broker_phone: z.string(),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "create_requirement", input);
      const gated = await requirePaidAccess(context);
      if (gated) return gated;

      const row = await createRequirementRecord(brokerId(context)!, input);
      return textResponse(`Requirement saved for ${input.locality} (${input.bhk}BHK, ${formatCurrencyCr(input.budget_min_cr)} to ${formatCurrencyCr(input.budget_max_cr)}).`, {
        requirement: row,
      });
    },
  );

  server.registerTool(
    "save_listing",
    {
      description:
        "Parse and save a broker listing to the PropAI workspace CRM. Paid workspaces only.",
      inputSchema: {
        raw_message: z.string(),
        locality: z.string(),
        bhk: z.number(),
        price: z.number().describe("Price in crores"),
        property_type: z.string(),
        broker_phone: z.string(),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "save_listing", input);
      const gated = await requirePaidAccess(context);
      if (gated) return gated;

      const row = await saveListingRecord(brokerId(context)!, input);
      return textResponse(`Listing saved for ${input.locality} at ${formatCurrencyCr(input.price)}.`, {
        listing: row,
      });
    },
  );

  server.registerTool(
    "set_follow_up",
    {
      description:
        "Create a follow-up task in PropAI for a broker or client callback. Paid workspaces only.",
      inputSchema: {
        contact_name: z.string(),
        contact_phone: z.string().optional(),
        note: z.string().optional(),
        follow_up_date: z.string().describe("ISO datetime or date string"),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "set_follow_up", input);
      const gated = await requirePaidAccess(context);
      if (gated) return gated;

      const task = await setFollowUpTask(brokerId(context)!, input);
      return textResponse(`Follow-up set for ${input.contact_name} on ${task.due_at}.`, {
        follow_up: task,
      });
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
    "market_summary",
    {
      description:
        "Return market summary stats for a locality using PropAI supply-demand data plus IGR market signals. Paid workspaces only.",
      inputSchema: {
        locality: z.string(),
        city: z.string().optional(),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "market_summary", input);
      const gated = await requirePaidAccess(context);
      if (gated) return gated;

      const result = await getMarketSummary(input);
      const avgIgr = result.avg_igr_price_per_sqft != null ? formatPerSqft(result.avg_igr_price_per_sqft) : "N/A";
      const ratio = result.supply_demand_ratio != null ? result.supply_demand_ratio.toFixed(2) : "N/A";
      return textResponse(
        `${result.locality}${result.city ? `, ${result.city}` : ""}: ${result.total_listings} listings, ${result.total_requirements} requirements, IGR avg ${avgIgr}, most active ${result.most_active_bhk || "N/A"}, supply-demand ratio ${ratio}.`,
        result,
      );
    },
  );

  server.registerTool(
    "broker_activity",
    {
      description:
        "Show top locality demand gaps for a city by comparing requirement volume vs listing volume. Paid workspaces only.",
      inputSchema: {
        city: z.string(),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "broker_activity", input);
      const gated = await requirePaidAccess(context);
      if (gated) return gated;

      const gaps = await getBrokerActivityGaps(input);
      if (!gaps.length) return noResults("broker activity gaps");

      const lines = gaps.map((gap, index) =>
        `${index + 1}. ${gap.locality}: ${gap.requirements} requirements vs ${gap.listings} listings (gap ${gap.demand_gap}, ratio ${gap.supply_demand_ratio ?? "N/A"})`,
      );
      return textResponse(`Top demand gaps in ${input.city}:\n\n${lines.join("\n")}`, { results: gaps });
    },
  );

  server.registerTool(
    "price_estimate",
    {
      description:
        "Estimate a market price range by combining IGR transactions and live stream listings. Paid workspaces only.",
      inputSchema: {
        building_name: z.string().optional(),
        locality: z.string(),
        bhk: z.number().optional(),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "price_estimate", input);
      const gated = await requirePaidAccess(context);
      if (gated) return gated;

      const estimate = await estimatePriceRange(input);
      if (estimate.estimated_min_cr == null || estimate.estimated_max_cr == null) {
        return textResponse("Not enough IGR or live listing data to estimate a price range for that query.", estimate);
      }

      return textResponse(
        `Estimated range for ${input.building_name || input.locality}${input.bhk ? ` ${input.bhk}BHK` : ""}: ${formatCurrencyCr(estimate.estimated_min_cr)} to ${formatCurrencyCr(estimate.estimated_max_cr)} (avg ${formatCurrencyCr(estimate.estimated_avg_cr)}).`,
        estimate,
      );
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
    "draft_broadcast",
    {
      description:
        "Generate a WaBro-ready Hinglish broadcast under 300 characters with emoji. Paid workspaces only.",
      inputSchema: {
        locality: z.string(),
        bhk: z.number(),
        price: z.number().describe("Price in crores"),
        description: z.string(),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "draft_broadcast", input);
      const gated = await requirePaidAccess(context);
      if (gated) return gated;

      try {
        const result = await generateAiJson<{ message: string }>({
          system: "You write crisp WhatsApp real-estate broadcast copy. Return JSON only with {\"message\": string}. The message must be Hinglish, include emoji, stay under 300 characters, and be WaBro-ready.",
          prompt: `Draft a broadcast for:
Locality: ${input.locality}
BHK: ${input.bhk}
Price (Cr): ${input.price}
Description: ${input.description}`,
        });

        const message = String(result.message || "").trim().slice(0, 300);
        return textResponse(message, { message });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI draft generation failed";
        return textResponse(`Could not draft broadcast right now: ${message}`);
      }
    },
  );

  server.registerTool(
    "qualify_lead",
    {
      description:
        "Classify a WhatsApp lead conversation into HOT/WARM/COLD with score and next action. Paid workspaces only.",
      inputSchema: {
        conversation_text: z.string(),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "qualify_lead", input);
      const gated = await requirePaidAccess(context);
      if (gated) return gated;

      let result: LeadQualification;
      try {
        result = await generateAiJson<LeadQualification>({
          system: "You are PropAI's lead response classifier. Return JSON only with keys: intent (HOT/WARM/COLD), score (1-10 integer), suggested_next_action (string).",
          prompt: `Classify this WhatsApp chat for sales intent:\n${input.conversation_text}`,
        });
      } catch {
        result = heuristicLeadQualification(input.conversation_text);
      }

      const normalized = {
        intent: result.intent,
        score: Math.min(10, Math.max(1, Math.round(Number(result.score) || 1))),
        suggested_next_action: result.suggested_next_action,
      };
      return textResponse(
        `${normalized.intent} lead (${normalized.score}/10). Next action: ${normalized.suggested_next_action}`,
        normalized,
      );
    },
  );

  server.registerTool(
    "summarise_thread",
    {
      description:
        "Summarise a WhatsApp thread into asks, commitments, follow-up need, and suggested reply. Paid workspaces only.",
      inputSchema: {
        conversation_text: z.string(),
      },
    },
    async (input) => {
      await logToolCall(brokerId(context), "summarise_thread", input);
      const gated = await requirePaidAccess(context);
      if (gated) return gated;

      try {
        const result = await generateAiJson<{
          key_asks: string[];
          commitments_made: string[];
          follow_up_required: boolean;
          suggested_reply: string;
        }>({
          system: "Summarise broker WhatsApp threads. Return JSON only with key_asks (string[]), commitments_made (string[]), follow_up_required (boolean), suggested_reply (string). Keep it concise and practical.",
          prompt: `Summarise this conversation thread:\n${input.conversation_text}`,
        });

        const asks = (result.key_asks || []).filter(Boolean).join("; ") || "None";
        const commitments = (result.commitments_made || []).filter(Boolean).join("; ") || "None";
        return textResponse(
          `Key asks: ${asks}\nCommitments: ${commitments}\nFollow-up required: ${result.follow_up_required ? "Yes" : "No"}\nSuggested reply: ${result.suggested_reply}`,
          result,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI summary failed";
        return textResponse(`Could not summarise thread right now: ${message}`);
      }
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
