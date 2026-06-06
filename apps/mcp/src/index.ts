import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "./supabase.js";
import { generateEmbedding } from "./embedding.js";
import { draftGrowthAssetWithLlm, extractThreadActionsWithLlm, summarizeBrokerThreadWithLlm } from "./ai.js";
import {
  buildBroadcastDraft,
  createRequirementRecord,
  describeSearch,
  estimatePrice,
  getBrokerActivity,
  getFreshStream,
  getHotLeadTriage,
  getIgrPrice,
  getMarketSummary,
  matchBuyerToInventory,
  getStaleLeadReactivation,
  buildPricingNegotiationBrief,
  logToolCall,
  qualifyLead,
  saveListingRecord,
  scheduleFollowUp,
  searchPublicListings,
  summarizeThread,
} from "./data.js";
import { formatCurrencyCr, listingLine } from "./format.js";
import { registerMcpPrompts } from "./prompts.js";
import { registerMcpResources } from "./resources.js";
import type { ToolContext } from "./types.js";

export const MCP_TOOL_NAMES = [
  "search_listings",
  "search_requirements",
  "get_igr_price",
  "match_listing_to_requirement",
  "semantic_search",
  "get_fresh_stream",
  "broker_activity",
  "triage_hot_leads",
  "extract_thread_actions",
  "save_thread_requirement",
  "save_thread_listing",
  "create_thread_follow_up",
  "buyer_to_inventory_match",
  "match_requirement_to_broker",
  "pricing_negotiation_brief",
  "stale_lead_reactivation",
  "draft_growth_asset",
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

  registerMcpResources(server, context);
  registerMcpPrompts(server);

  server.registerTool(
    "draft_growth_asset",
    {
      description:
        "Draft GTM or marketing copy for PropAI such as launch posts, broker pitches, partner outreach, or case-study style summaries.",
      inputSchema: {
        asset_type: z.enum(["launch_post", "broker_pitch", "partner_outreach", "case_study"]),
        audience: z.string().describe("Who this is for, e.g. Mumbai brokers, channel partners, investors"),
        context: z.string().describe("Facts, proof points, feature notes, or the situation to write from"),
        tone: z.string().optional().describe("Optional tone direction"),
      },
    },
    async (input) => {
      const result = await draftGrowthAssetWithLlm({
        assetType: input.asset_type,
        audience: input.audience,
        context: input.context,
        tone: input.tone,
      });

      return textResponse(
        `${result.title}\n\n${result.body}\n\nCTA: ${result.CTA}\nAngle: ${result.angle}`,
        result,
      );
    },
  );

  server.registerTool(
    "extract_thread_actions",
    {
      description:
        "Extract likely CRM actions from a stored WhatsApp thread: buyer requirements, listings, follow-ups, and unresolved questions.",
      inputSchema: {
        remote_jid: z.string().describe("Chat JID to inspect"),
        limit: z.number().default(50).describe("How many recent messages to scan"),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "extract_thread_actions", input);
      const thread = await summarizeThread({
        brokerId: id,
        remote_jid: input.remote_jid,
        limit: input.limit,
      });

      if (!thread.message_count) {
        return textResponse("No stored thread history found for that chat.", {
          ...thread,
          requirements: [],
          listings: [],
          follow_ups: [],
          unresolved_questions: ["No stored thread history found for that chat."],
          recommended_actions: [],
        });
      }

      const actions = await extractThreadActionsWithLlm({
        remoteJid: input.remote_jid,
        lines: thread.key_points.map((item) => `${item.sender || "Unknown"}: ${item.text}`),
      });

      const lines = [
        `Extracted ${actions.requirements.length} requirement candidate(s), ${actions.listings.length} listing candidate(s), and ${actions.follow_ups.length} follow-up candidate(s).`,
        actions.recommended_actions.length
          ? `Recommended actions: ${actions.recommended_actions.join(" | ")}`
          : "Recommended actions: none yet.",
        actions.unresolved_questions.length
          ? `Open questions: ${actions.unresolved_questions.join(" | ")}`
          : "Open questions: none.",
      ];

      return textResponse(lines.join("\n\n"), {
        remote_jid: input.remote_jid,
        message_count: thread.message_count,
        requirements: actions.requirements,
        listings: actions.listings,
        follow_ups: actions.follow_ups,
        unresolved_questions: actions.unresolved_questions,
        recommended_actions: actions.recommended_actions,
      });
    },
  );

  server.registerTool(
    "stale_lead_reactivation",
    {
      description:
        "Find stale leads that are worth reactivating and draft a practical re-engagement opener for each one.",
      inputSchema: {
        days_stale: z.number().default(21).describe("Minimum stale age in days"),
        limit: z.number().default(10).describe("How many stale leads to return"),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "stale_lead_reactivation", input);
      const result = await getStaleLeadReactivation({ brokerId: id, ...input });

      if (!result.items.length) {
        return textResponse("No stale leads worth reactivating found for this window.", result);
      }

      const lines = result.items.map((item, index) => {
        const location = item.location ? ` in ${item.location}` : "";
        return `${index + 1}. ${item.name}${location} - score ${item.score}. Why: ${item.why.join(", ")}. Opener: ${item.reactivation_opener}`;
      });

      return textResponse(
        `Found ${result.items.length} stale leads worth reactivating:\n\n${lines.join("\n")}`,
        result,
      );
    },
  );

  server.registerTool(
    "pricing_negotiation_brief",
    {
      description:
        "Build a pricing and negotiation brief using current asking price, market comparables, and Maharashtra IGR context.",
      inputSchema: {
        locality: z.string().optional(),
        building_name: z.string().optional(),
        bhk: z.number().optional(),
        area_sqft: z.number().optional(),
        asking_price_cr: z.number().optional().describe("Current asking price in crores"),
        property_type: z.enum(["sale", "rent", "lease", "all"]).default("sale"),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "pricing_negotiation_brief", input);
      const result = await buildPricingNegotiationBrief(input);

      const leverage = result.leverage_points.length
        ? `Leverage: ${result.leverage_points.join(" | ")}`
        : "Leverage: not enough pricing anchors yet.";
      const risks = result.risks.length
        ? `Risks: ${result.risks.join(" | ")}`
        : "Risks: no major pricing data gaps flagged.";

      return textResponse(
        `${result.summary}\n\nNegotiation stance: ${result.negotiation_stance}\n\n${leverage}\n\n${risks}`,
        result,
      );
    },
  );

  server.registerTool(
    "buyer_to_inventory_match",
    {
      description:
        "Match a buyer brief to current inventory from the PropAI broker network, workspace CRM, or both, with explainable ranking.",
      inputSchema: {
        raw_text: z.string().optional().describe("Buyer brief or requirement note"),
        locality: z.string().optional(),
        city: z.string().optional(),
        bhk: z.number().optional(),
        max_budget_cr: z.number().optional(),
        property_type: z.enum(["sale", "rent", "lease", "all"]).default("sale"),
        source_mode: z.enum(["public", "workspace", "both"]).default("both"),
        limit: z.number().default(8),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "buyer_to_inventory_match", input);
      const result = await matchBuyerToInventory({ brokerId: id, ...input });

      if (!result.items.length) {
        return textResponse("No strong inventory matches found for this buyer brief yet.", result);
      }

      const lines = result.items.map((item, index) => {
        const location = item.location ? ` in ${item.location}` : "";
        const price = item.price != null ? `, approx ${formatCurrencyCr(item.price)}` : "";
        return `${index + 1}. ${item.title}${location}${price} - score ${item.score}. Why: ${item.why.join(", ")}. Next: ${item.suggested_action}`;
      });

      return textResponse(
        `Found ${result.items.length} ranked buyer-to-inventory matches:\n\n${lines.join("\n")}`,
        result,
      );
    },
  );

  server.registerTool(
    "save_thread_requirement",
    {
      description:
        "Persist one extracted thread requirement candidate into the broker CRM.",
      inputSchema: {
        raw_text: z.string().describe("Requirement text to save"),
        name: z.string().optional().describe("Lead or buyer name"),
        phone: z.string().optional().describe("Lead phone number"),
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
      await logToolCall(id, "save_thread_requirement", input);
      const result = await createRequirementRecord({ brokerId: id, ...input });
      return textResponse(
        `Thread requirement saved${result.lead?.lead_id ? ` with lead id ${result.lead.lead_id}` : ""} for ${input.location_pref || "the requested location"}.`,
        result,
      );
    },
  );

  server.registerTool(
    "save_thread_listing",
    {
      description:
        "Persist one extracted thread listing candidate into the broker CRM.",
      inputSchema: {
        raw_text: z.string().describe("Listing text to save"),
        name: z.string().optional().describe("Contact or owner name"),
        phone: z.string().optional().describe("Contact phone number"),
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
      await logToolCall(id, "save_thread_listing", input);
      const result = await saveListingRecord({ brokerId: id, ...input });
      return textResponse(
        `Thread listing saved${result.listing_id ? ` with id ${result.listing_id}` : ""} for ${result.listing.location || "the requested location"}.`,
        result,
      );
    },
  );

  server.registerTool(
    "create_thread_follow_up",
    {
      description:
        "Create one follow-up task from an extracted thread action candidate.",
      inputSchema: {
        lead_id: z.string().optional(),
        lead_name: z.string().describe("Lead name for the follow-up"),
        lead_phone: z.string().optional(),
        due_at: z.string().optional().describe("ISO datetime. Defaults to 24h from now."),
        notes: z.string().optional(),
        action_type: z.enum(["call", "email", "visit"]).default("call"),
        priority_bucket: z.enum(["P1", "P2", "P3"]).optional(),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "create_thread_follow_up", input);
      const result = await scheduleFollowUp({ brokerId: id, ...input });
      return textResponse(
        `Thread follow-up scheduled for ${input.lead_name} at ${result.due_at}.`,
        result,
      );
    },
  );

  server.registerTool(
    "triage_hot_leads",
    {
      description:
        "Rank the broker's hottest leads by urgency, follow-up pressure, and recent activity so they know what to handle first.",
      inputSchema: {
        days: z.number().default(7).describe("Look back window in days"),
        limit: z.number().default(10).describe("How many hot leads to return"),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "triage_hot_leads", input);
      const result = await getHotLeadTriage({ brokerId: id, days: input.days, limit: input.limit });

      if (!result.items.length) {
        return textResponse("No hot-lead candidates found for this window yet.", result);
      }

      const lines = result.items.map((item, index) => {
        const place = item.location ? ` in ${item.location}` : "";
        const due = item.due_at ? `, follow-up ${item.due_at}` : "";
        return `${index + 1}. ${item.name}${place} - score ${item.score}${due}. Why: ${item.why.join(", ")}. Next: ${item.next_action}`;
      });

      return textResponse(
        `Hot lead triage for the last ${result.days} days:\n\n${lines.join("\n")}`,
        result,
      );
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
    "match_requirement_to_broker",
    {
      description:
        "Match a buyer or tenant requirement to brokers who have suitable listings in the PropAI broker network, workspace CRM, or both.",
      inputSchema: {
        raw_text: z.string().optional().describe("Requirement brief or search note"),
        locality: z.string().optional(),
        city: z.string().optional(),
        bhk: z.number().optional(),
        max_budget_cr: z.number().optional(),
        property_type: z.enum(["sale", "rent", "lease", "all"]).default("sale"),
        source_mode: z.enum(["public", "workspace", "both"]).default("both"),
        limit: z.number().default(8),
      },
    },
    async (input) => {
      const id = requireBrokerId(context);
      await logToolCall(id, "match_requirement_to_broker", input);
      const result = await matchBuyerToInventory({ brokerId: id, ...input });

      if (!result.items.length) {
        return textResponse("No broker matches found for this requirement yet. Try widening the locality, budget, or source mode.", result);
      }

      const lines = result.items.map((item, index) => {
        const location = item.location ? ` in ${item.location}` : "";
        const price = item.price != null ? `, approx ${formatCurrencyCr(item.price)}` : "";
        return `${index + 1}. ${item.title}${location}${price} - score ${item.score}. Why: ${item.why.join(", ")}. Next: ${item.suggested_action}`;
      });

      return textResponse(
        `Found ${result.items.length} broker matches for this requirement:\n\n${lines.join("\n")}`,
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
        `Market summary for the last ${result.days} days: ${result.listing_count} comparable listings, average ${result.avg_price_cr != null ? formatCurrencyCr(result.avg_price_cr) : "price unavailable"}, median ${result.median_price_cr != null ? formatCurrencyCr(result.median_price_cr) : "price unavailable"}, average ${result.avg_price_per_sqft != null ? `₹${result.avg_price_per_sqft.toLocaleString("en-IN")}/sqft` : "ppsf unavailable"}. Top localities: ${topLocalities}.`,
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
      const thread = await summarizeThread({
        brokerId: id,
        remote_jid: input.remote_jid,
        limit: input.limit,
      });

      if (!thread.message_count) {
        return textResponse("No stored thread history found for that chat.", thread);
      }

      const llmSummary = await summarizeBrokerThreadWithLlm({
        remoteJid: input.remote_jid,
        lines: thread.key_points.map((item) => `${item.sender || "Unknown"}: ${item.text}`),
      });

      return textResponse(
        `Thread summary: ${llmSummary.summary}\n\nNext action: ${llmSummary.next_action}\n\nRecent highlights:\n${llmSummary.key_points.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
        {
          ...thread,
          ai_summary: llmSummary.summary,
          next_action: llmSummary.next_action,
          key_points: llmSummary.key_points,
        },
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
        budget_min_cr: z.number().describe("Min budget in crores").optional(),
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
        budget_min_cr: z.number().optional(),
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

      const embedding = await generateEmbedding(input.query);
      if (!embedding) {
        return textResponse("Could not generate an embedding right now. Try the search_listings tool instead.");
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
        limit: z.number().default(50),
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
