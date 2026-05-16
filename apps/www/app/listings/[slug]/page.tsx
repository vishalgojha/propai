import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingCard } from "@/components/listing-card";
import { getListingBySlug, getRelatedListings } from "@/lib/listings";
import { canonicalUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const listing = await getListingBySlug(params.slug);
  if (!listing) return {};
  const title = `${listing.bhk} for ${listing.type === "rent" ? "Rent" : listing.type === "sale" ? "Sale" : "Requirement"} in ${listing.locality}, ${listing.city} — ${listing.priceLabel} | PropAI`;
  const description = `${listing.bhk} in ${listing.area}, ${listing.locality}. ${listing.areaSqft ? `${listing.areaSqft} sqft, ` : ""}${listing.furnishing || "unfurnished"}. ${listing.priceLabel}.`;
  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl(`/listings/${listing.slug}`)
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl(`/listings/${listing.slug}`),
      type: "article"
    }
  };
}

export default async function ListingDetailPage({
  params,
  searchParams
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const listing = await getListingBySlug(params.slug);
  if (!listing) notFound();
  const related = await getRelatedListings(listing);
  const leadStatus = typeof searchParams.lead === "string" ? searchParams.lead : "";

  const schema = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: `${listing.bhk} for ${listing.type === "rent" ? "Rent" : listing.type === "sale" ? "Sale" : "Requirement"} in ${listing.locality}, ${listing.city}`,
    description: listing.description,
    url: canonicalUrl(`/listings/${listing.slug}`),
    datePosted: listing.createdAt,
    price: listing.priceAmount || undefined,
    priceCurrency: "INR",
    address: {
      "@type": "PostalAddress",
      addressLocality: listing.locality,
      addressRegion: listing.city,
      addressCountry: "IN"
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="text-sm text-[#8ea2ba]">
        <Link href="/">Home</Link> &gt; <Link href="/listings">Listings</Link> &gt; <Link href={`/locality/${listing.localitySlug}`}>{listing.locality}</Link> &gt; {listing.bhk}
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        <section>
          <h1 className="font-display text-4xl text-white">{listing.bhk} for {listing.type === "rent" ? "Rent" : listing.type === "sale" ? "Sale" : "Requirement"} in {listing.locality}, {listing.city}</h1>
          <div className="placeholder-grid mt-6 aspect-[4/3] rounded-[28px] border border-[#243040] bg-gradient-to-br from-[#0d1a14] to-[#141c26]" />
          <div className="mt-8 grid gap-8">
            <div>
              <h2 className="font-display text-2xl text-white">Description</h2>
              <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-[#d2dbe7]">{listing.description}</p>
            </div>
            <div>
              <h2 className="font-display text-2xl text-white">Details</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {[
                  ["BHK", listing.bhk],
                  ["Sqft", listing.areaSqft ? `${listing.areaSqft} sqft` : "—"],
                  ["Floor", listing.floor || "—"],
                  ["Building", listing.building || "—"],
                  ["Furnishing", listing.furnishing || "—"],
                  ["Parking", listing.parking || "—"],
                  ["Deposit", listing.deposit || "—"]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-[#243040] bg-[#101722]/80 p-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-[#8ea2ba]">{label}</div>
                    <div className="mt-2 text-base text-white">{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="font-display text-2xl text-white">Amenities</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {listing.amenities.map((amenity) => (
                  <span key={amenity} className="rounded-full border border-[#243040] bg-[#101722] px-3 py-1 text-sm text-[#d2dbe7]">{amenity}</span>
                ))}
              </div>
            </div>
            <p className="text-sm text-[#8ea2ba]">Sourced from broker WhatsApp network · Posted {new Date(listing.createdAt).toLocaleString("en-IN")}</p>
          </div>
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-[28px] border border-[#243040] bg-[#101722]/90 p-6 shadow-card">
            <div className="text-3xl font-semibold text-white">{listing.priceLabel}</div>
            <div className="mt-2 text-sm text-[#8ea2ba]">{listing.locality}, {listing.area}</div>

            <div className="mt-6 border-t border-[#243040] pt-6">
              {listing.isPro && listing.brokerPhone ? (
                <div className="space-y-3">
                  <div className="text-lg text-white">{listing.brokerName || "Verified broker"}</div>
                  <div className="font-mono text-[#d2dbe7]">+91 {listing.brokerPhone}</div>
                  <div className="flex gap-3">
                    <a href={`https://wa.me/91${listing.brokerPhone}`} className="rounded-full bg-[#3EE88A] px-4 py-2 text-sm font-semibold text-black">WhatsApp</a>
                    <a href={`tel:+91${listing.brokerPhone}`} className="rounded-full border border-[#243040] px-4 py-2 text-sm text-[#d2dbe7]">Call</a>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-[#f3c66c]">Broker not on PropAI Pro</div>
                  <Link href="/broker/signup" className="inline-flex rounded-full border border-[#5a4a22] px-4 py-2 text-sm text-white">Unlock contact →</Link>
                </div>
              )}
            </div>

            <form action="/api/leads" method="POST" className="mt-6 space-y-3">
              {leadStatus ? <LeadBanner status={leadStatus} /> : null}
              <input type="hidden" name="listingId" value={listing.id} />
              <input name="name" placeholder="Your name" className="h-12 w-full rounded-2xl border border-[#243040] bg-[#0d1117] px-4 text-white" />
              <input name="phone" placeholder="Your phone" className="h-12 w-full rounded-2xl border border-[#243040] bg-[#0d1117] px-4 text-white" />
              <button type="submit" className="h-12 w-full rounded-2xl bg-[#3EE88A] font-semibold text-black">Request details</button>
            </form>
          </div>
        </aside>
      </div>

      <section className="mt-14">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-3xl text-white">Related listings</h2>
          <Link href={`/locality/${listing.localitySlug}`} className="text-sm text-[#3EE88A]">More in {listing.locality} →</Link>
        </div>
        <div className="flex gap-6 overflow-x-auto pb-4">
          {related.map((item) => (
            <div key={item.id} className="min-w-[320px] flex-1">
              <ListingCard listing={item} />
            </div>
          ))}
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </main>
  );
}

function LeadBanner({ status }: { status: string }) {
  if (status === "ok") {
    return <p className="rounded-2xl border border-[#1f5a34] bg-[#0f2a1e] px-4 py-3 text-sm text-[#9ef0ba]">Your request was submitted. The broker can follow up from PropAI.</p>;
  }

  const message =
    status === "missing"
      ? "This listing is no longer available for public enquiries."
      : status === "unavailable"
        ? "Lead capture is temporarily unavailable."
        : status === "save-error"
          ? "The enquiry could not be saved right now. Please try again."
          : "Enter a valid name and 10-digit phone number.";

  return <p className="rounded-2xl border border-[#5a2f22] bg-[#24140f] px-4 py-3 text-sm text-[#f7c7b8]">{message}</p>;
}
