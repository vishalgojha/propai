import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerMcpPrompts(server: McpServer) {
  server.registerPrompt(
    "daily_activity_review",
    {
      title: "Daily Activity Review",
      description: "Review the broker's last few days of activity, pending follow-ups, and locality concentration.",
      argsSchema: {
        days: z.string().optional().describe("Lookback window in days, e.g. 3 or 7"),
      },
    },
    async ({ days }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Review my PropAI activity for the last ${days || "7"} days. Use broker_activity and broker follow-up context. Tell me what is hot, stale, and what I should do next.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "match_buyer_to_inventory",
    {
      title: "Match Buyer to Inventory",
      description: "Turn a buyer brief into listing matches from the PropAI broker network.",
      argsSchema: {
        brief: z.string().describe("Buyer requirement or raw brief"),
      },
    },
    async ({ brief }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Match this buyer to fresh inventory using PropAI search tools: ${brief}`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "summarise_broker_thread",
    {
      title: "Summarise Broker Thread",
      description: "Summarize a broker chat and tell me the strongest next action.",
      argsSchema: {
        remote_jid: z.string().describe("Thread JID, for example 9198...@s.whatsapp.net"),
      },
    },
    async ({ remote_jid }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Summarise thread ${remote_jid}. Pull the stored thread history and tell me key points, pending questions, and the next recommended action.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "price_property_with_igr",
    {
      title: "Price Property with IGR",
      description: "Estimate a property using both market comparables and IGR context.",
      argsSchema: {
        locality: z.string().optional(),
        building_name: z.string().optional(),
        area_sqft: z.string().optional(),
      },
    },
    async ({ locality, building_name, area_sqft }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Estimate this property using PropAI price tools. Locality: ${locality || "not provided"}. Building: ${building_name || "not provided"}. Area: ${area_sqft || "not provided"} sqft.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "review_follow_up_queue",
    {
      title: "Review Follow-Up Queue",
      description: "Review pending callbacks and suggest what should be handled first.",
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Review my PropAI follow-up queue, tell me the most urgent callbacks first, and suggest the next 3 actions.",
          },
        },
      ],
    }),
  );
}
