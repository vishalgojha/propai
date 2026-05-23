import type { Metadata } from "next";
import { fetchPublicListings } from "@/lib/publicListings";
import Listings from "@/pages/Listings";

export const metadata: Metadata = {
  title: "Off-Market Real Estate Listings Mumbai | PropAI Pulse",
  description:
    "Browse real-time off-market properties in Mumbai. Filter by locality, price, and typology. Sourced directly from broker broadcasts.",
};

export default async function Page() {
  let initialListings: Awaited<ReturnType<typeof fetchPublicListings>> = [];
  try {
    initialListings = await fetchPublicListings();
  } catch {
    // Fallback to client-side fetch on error
  }
  return <Listings initialListings={initialListings} />;
}
