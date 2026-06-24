import { supabase } from "./supabase.js";

// Import all the functions we need to test
// We'll import from the index.ts which re-exports everything
import * as mcp from "./index.js";

async function main() {
  console.log("=== Starting MCP Tools Audit ===\n");

  // Get a test broker ID
  let TEST_BROKER_ID = "";
  try {
    const { data: members, error } = await supabase
      .from("workspace_members")
      .select("workspace_owner_id")
      .eq("status", "active")
      .limit(1);

    if (error) {
      console.error("Error fetching active members:", error);
      // Fallback to first profile
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .limit(1);

      if (profileError) {
        console.error("Error fetching profiles:", profileError);
        // Last resort: use a placeholder (but this will likely fail)
        TEST_BROKER_ID = "00000000-0000-0000-0000-000000000000";
      } else if (profiles && profiles.length > 0) {
        TEST_BROKER_ID = profiles[0].id;
      }
    } else if (members && members.length > 0) {
      TEST_BROKER_ID = members[0].workspace_owner_id;
    }
  } catch (err) {
    console.error("Unexpected error getting test broker ID:", err);
    TEST_BROKER_ID = "00000000-0000-0000-0000-000000000000";
  }

  console.log("Using test broker ID:", TEST_BROKER_ID);
  console.log("");

  // Helper to safely call functions and log results
  const testFn = async <T>(name: string, fn: () => Promise<T>) => {
    try {
      const result = await fn();
      // If result is an array, show length and first item snippet
      if (Array.isArray(result)) {
        const preview: result.length > 0 && result[0] ? JSON.stringify(result[0]).substring(0, 120) + (JSON.stringify(result[0]).length > 120 ? "..." : "") : "N/A";
        console.log(`${name}: ${result.length} rows`, result.length > 0 ? `sample: ${preview}` : "EMPTY");
      } else if (result && typeof result === 'object') {
        // For objects, show a preview of selected fields or just say it's an object
        const keys = Object.keys(result);
        if (keys.length === 0) {
          console.log(`${name}: {}`);
        } else {
          // Try to show a meaningful preview
          const previewObj: Record<string, any> = {};
          for (const key of ['listing_count', 'avg_price_cr', 'summary', 'leads_total', 'messages_total', 'locality_supply']) {
            if (result[key] !== undefined) {
              previewObj[key] = result[key];
            }
          }
          if (Object.keys(previewObj).length > 0) {
            console.log(`${name}:`, JSON.stringify(previewObj).substring(0, 150) + (JSON.stringify(previewObj).length > 150 ? "..." : ""));
          } else {
            console.log(`${name}: object with keys [${keys.join(', ')}]`);
          }
        }
      } else {
        console.log(`${name}:`, result);
      }
    } catch (error: any) {
      console.error(`${name}: ERROR -`, error.message || error);
    }
  };

  // Group 1: Public listing search (most critical)
  console.log("--- Group 1: Public listing search ---");
  await testFn("search_listings sale", () => mcp.searchPublicListings({ locality: "Bandra", property_type: "sale", limit: 3, listingKind: "listing" }));
  await testFn("search_listings rent", () => mcp.searchPublicListings({ locality: "Andheri", property_type: "rent", limit: 3, listingKind: "listing" }));
  await testFn("search_listings all", () => mcp.searchPublicListings({ limit: 5 }));
  await testFn("search_requirements", () => mcp.searchPublicListings({ locality: "Bandra", listingKind: "requirement", limit: 3 }));
  await testFn("get_fresh_stream", () => mcp.getFreshStream({ hours: 24, limit: 5 }));
  console.log("");

  // Group 2: Market intelligence
  console.log("--- Group 2: Market intelligence ---");
  await testFn("market_summary", () => mcp.getMarketSummary({ locality: "Bandra", days: 30, limit: 50 }));
  await testFn("building_intel", () => mcp.getBuildingIntel({ building_name: "Kalpataru", days_back: 90 }));
  await testFn("get_igr_price", () => mcp.getIgrPrice({ locality: "Bandra West" }));
  await testFn("price_estimate", () => mcp.estimatePrice({ locality: "Bandra", bhk: 2, property_type: "sale" }));
  await testFn("pricing_negotiation_brief", () => mcp.buildPricingNegotiationBrief({ locality: "Bandra", bhk: 2, asking_price_cr: 3.5 }));
  console.log("");

  // Group 3: Broker workspace (requires brokerId)
  console.log("--- Group 3: Broker workspace ---");
  await testFn("broker_activity", () => mcp.getBrokerActivity({ brokerId: TEST_BROKER_ID, days: 7 }));
  await testFn("triage_hot_leads", () => mcp.getHotLeadTriage({ brokerId: TEST_BROKER_ID, days: 7, limit: 5 }));
  console.log("");

  console.log("\n=== Audit Complete ===");
}

// Run the audit
main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});