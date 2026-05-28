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
      ? `${listing.bhk} in ${listing.locality}. ${listing.furnishing || ""} ${listing.area_sqft ? `· ${listing.area_sqft} sqft` : ""} · ₹${listing.price.toLocaleString()}`
      : `Off-market property in ${listing.locality}. Updated with real-time market intelligence.`;
    return {
      title,
      description,
      alternates: {
        canonical: `https://www.propai.live/listings/${listing.slug}`,
      },
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

  const listingJsonLd = initialListing ? {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: initialListing.title,
    description: initialListing.raw_text.slice(0, 500),
    url: `https://www.propai.live/listings/${initialListing.slug}`,
    offers: {
      "@type": "Offer",
      price: initialListing.price || undefined,
      priceCurrency: "INR",
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: initialListing.locality,
    },
  } : null;

  return (
    <>
      {listingJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(listingJsonLd) }}
        />
      ) : null}
      <ListingDetail slug={slug} initialListing={initialListing} />
    </>
  );
}
