import type { Metadata } from "next";
import { fetchPublicListingBySlug, fetchRelatedListings, type PublicListing } from "@/lib/publicListings";
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
    const descriptionBits = [
      listing.configuration ? `${String(listing.configuration).replace(/\s*BHK$/i, "")} BHK` : null,
      listing.locality ? `in ${listing.locality}` : null,
      listing.furnishing ? listing.furnishing : null,
      listing.area_sqft ? `${listing.area_sqft} sqft` : null,
      listing.price > 0 ? `₹${listing.price.toLocaleString()}` : "Price on request",
    ].filter(Boolean);
    const description = descriptionBits.length
      ? descriptionBits.join(" · ")
      : `Broker-listed property in ${listing.locality} with PropAI market intelligence.`;
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
  let initialRelated: PublicListing[] = [];
  try {
    initialListing = await fetchPublicListingBySlug(slug);
    if (initialListing) {
      initialRelated = await fetchRelatedListings(initialListing);
    }
  } catch {
    // Fallback to client-side fetch
  }

  const listingJsonLd = initialListing ? {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: initialListing.title,
    description: [
      initialListing.type === "Requirement" ? "Wanted" : initialListing.type === "Rent" ? "Available for rent" : "Available for sale",
      initialListing.configuration ? `${String(initialListing.configuration).replace(/\s*BHK$/i, "")} BHK` : null,
      initialListing.locality ? `in ${initialListing.locality}` : null,
      initialListing.furnishing || null,
      initialListing.area_sqft ? `${initialListing.area_sqft} sqft` : null,
    ].filter(Boolean).join(" "),
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
      <ListingDetail slug={slug} initialListing={initialListing} initialRelated={initialRelated} />
    </>
  );
}
