import type { Metadata } from "next";
import { fetchPublicListings } from "@/lib/publicListings";
import Listings from "@/pages/Listings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Off-Market Real Estate Listings | PropAI Pulse",
  description:
    "Browse real-time off-market properties across India. Filter by locality, price, typology, and active market signal.",
};

function firstQueryValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({
  searchParams,
}: {
  searchParams?: { locality?: string | string[] };
}) {
  const initialLocality = firstQueryValue(searchParams?.locality)?.trim() || "";
  let initialListings: Awaited<ReturnType<typeof fetchPublicListings>> = [];
  try {
    initialListings = await fetchPublicListings(initialLocality || undefined);
  } catch {
    // Fallback to client-side fetch on error
  }
  return <Listings key={initialLocality || "all"} initialListings={initialListings} initialLocality={initialLocality} />;
}
