import type { Metadata } from "next";
import { fetchPublicListings } from "@/lib/publicListings";
import Listings from "@/pages/Listings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Direct Broker-Network Real Estate Listings | PropAI Pulse",
  description:
    "Browse broker-listed property inventory, requirements, and market context across active localities.",
};

function firstQueryValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({
  searchParams,
}: {
  searchParams?: { locality?: string | string[]; q?: string | string[] };
}) {
  const initialLocality = firstQueryValue(searchParams?.locality)?.trim() || "";
  const initialQuery = firstQueryValue(searchParams?.q)?.trim() || "";
  let initialListings: Awaited<ReturnType<typeof fetchPublicListings>> = [];
  try {
    initialListings = await fetchPublicListings(initialLocality || initialQuery || undefined);
  } catch {
    // Fallback to client-side fetch on error
  }
  return (
    <Listings
      key={initialLocality || initialQuery || "all"}
      initialListings={initialListings}
      initialLocality={initialLocality}
      initialQuery={initialQuery}
    />
  );
}
