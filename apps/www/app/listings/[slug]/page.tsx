import type { Metadata } from "next";
import { fetchPublicListingBySlug, fetchRelatedListings, type PublicListing } from "@/lib/publicListings";
import ListingDetail from "@/pages/ListingDetail";

export const dynamic = "force-dynamic";

const baseUrl = "https://www.propai.live";

function formatPriceForSchema(price: number): number {
  return price;
}

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
    const descriptionParts = [
      listing.configuration ? `${String(listing.configuration).replace(/\s*BHK$/i, "")} BHK` : null,
      listing.locality ? `in ${listing.locality}` : null,
      listing.furnishing || null,
      listing.area_sqft ? `${listing.area_sqft} sqft` : null,
      listing.price > 0 ? `asking ₹${listing.price.toLocaleString()}` : null,
    ].filter(Boolean);
    const description = descriptionParts.length
      ? `Looking for a ${descriptionParts.join(", ")}? View fresh listing details on PropAI.`
      : `Broker-listed property in ${listing.locality} with PropAI market intelligence.`;
    const canonicalUrl = `${baseUrl}/listings/${listing.slug}`;
    return {
      title,
      description,
      robots: { index: true, follow: true },
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title,
        description,
        type: "website",
        locale: "en_IN",
        url: canonicalUrl,
        siteName: "PropAI",
        images: listing.cover_image ? [{ url: listing.cover_image }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: listing.cover_image ? [listing.cover_image] : undefined,
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

  const listingJsonLd = initialListing ? (() => {
    const props: Record<string, unknown>[] = [];
    if (initialListing.furnishing) {
      props.push({ "@type": "PropertyValue", name: "Furnishing", value: initialListing.furnishing });
    }
    if (initialListing.floor) {
      props.push({ "@type": "PropertyValue", name: "Floor", value: initialListing.floor });
    }
    if (initialListing.availability) {
      props.push({ "@type": "PropertyValue", name: "Availability", value: initialListing.availability });
    }

    return {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      "@id": `${baseUrl}/listings/${initialListing.slug}`,
      name: initialListing.title,
      description: [
        initialListing.type === "Requirement" ? "Wanted" : initialListing.type === "Rent" ? "Available for rent" : "Available for sale",
        initialListing.configuration ? `${String(initialListing.configuration).replace(/\s*BHK$/i, "")} BHK` : null,
        initialListing.locality ? `in ${initialListing.locality}` : null,
        initialListing.furnishing || null,
        initialListing.area_sqft ? `${initialListing.area_sqft} sqft` : null,
      ].filter(Boolean).join(" "),
      url: `${baseUrl}/listings/${initialListing.slug}`,
      image: initialListing.cover_image || undefined,
      numberOfRooms: initialListing.configuration
        ? parseInt(String(initialListing.configuration).replace(/\D/g, ""), 10) || undefined
        : undefined,
      floorSize: initialListing.area_sqft
        ? { "@type": "QuantitativeValue", value: initialListing.area_sqft, unitCode: "FTK" }
        : undefined,
      offers: {
        "@type": "Offer",
        price: initialListing.price > 0 ? formatPriceForSchema(initialListing.price) : undefined,
        priceCurrency: "INR",
        availability: initialListing.type === "Rent"
          ? "https://schema.org/InStock"
          : initialListing.type === "Sale"
          ? "https://schema.org/InStock"
          : undefined,
      },
      address: {
        "@type": "PostalAddress",
        addressLocality: initialListing.locality,
        addressRegion: "Maharashtra",
        addressCountry: "IN",
      },
      ...(props.length > 0 ? { additionalProperty: props } : {}),
    };
  })() : null;

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
