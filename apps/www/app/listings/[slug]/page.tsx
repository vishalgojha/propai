import type { Metadata } from "next";
import { fetchPublicListingBySlug, type PublicListing } from "@/lib/publicListings";
import ListingDetail from "@/pages/ListingDetail";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const listing = await fetchPublicListingBySlug(slug);
    if (!listing) {
      return { title: "Listing Not Found — PropAI Pulse" };
    }
    const dealType =
      listing.type === "Requirement" ? "Wanted" : listing.type === "Rent" ? "Available for rent" : "Available for sale";
    const title = `${listing.title} — ${dealType} in ${listing.locality} | PropAI Pulse`;
    const description = listing.bhk
      ? `${listing.bhk} in ${listing.locality}, Mumbai. ${listing.furnishing || ""} ${listing.area_sqft ? `· ${listing.area_sqft} sqft` : ""} · ₹${listing.price.toLocaleString()}`
      : `Off-market property in ${listing.locality}, Mumbai. Sourced from real-time broker broadcasts.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        locale: "en_IN",
      },
    };
  } catch {
    return { title: "Property Details — PropAI Pulse" };
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let initialListing: PublicListing | null = null;
  try {
    initialListing = await fetchPublicListingBySlug(slug);
  } catch {
    // Fallback to client-side fetch
  }
  return <ListingDetail slug={slug} initialListing={initialListing} />;
}
