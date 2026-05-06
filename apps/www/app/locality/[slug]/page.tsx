import type { Metadata } from "next";
import Link from "next/link";
import { ListingCard } from "@/components/listing-card";
import { getAllLocalitySlugs, getLocalityPageData } from "@/lib/listings";
import { canonicalUrl, formatCurrencyShort, localityDescriptions, nearbyLocalities, slugifyLocality } from "@/lib/site";

export const dynamic = "force-dynamic";

// Removed generateStaticParams - using dynamic rendering

export async function generateMetadata({
  params,
  searchParams
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}): Promise<Metadata> {
  const requestedPage = typeof searchParams.page === "string" ? Math.max(1, Number(searchParams.page) || 1) : 1;
  const data = await getLocalityPageData(params.slug, requestedPage);
  const canonicalPath = buildLocalityPagePath(params.slug, data.page);
  return {
    title: `Properties in ${data.locality}, India — Rent & Sale | PropAI`,
    description: `Browse ${data.total} verified listings in ${data.locality}. ${data.stats.rent} for rent, ${data.stats.sale} for sale.`,
    alternates: {
      canonical: canonicalUrl(canonicalPath)
    },
    openGraph: {
      title: `Properties in ${data.locality}, India — Rent & Sale | PropAI`,
      description: `Browse ${data.total} verified listings in ${data.locality}. ${data.stats.rent} for rent, ${data.stats.sale} for sale.`,
      url: canonicalUrl(canonicalPath),
      type: "website"
    }
  };
}

export default async function LocalityPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const page = typeof searchParams.page === "string" ? Math.max(1, Number(searchParams.page) || 1) : 1;
  const data = await getLocalityPageData(params.slug, page);
  const description = localityDescriptions[params.slug] || `${data.locality} is an active live market tracked through broker network inventory and buyer demand signals on PropAI.`;
  const nearby = nearbyLocalities[params.slug] || [];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      {data.page > 1 ? <link rel="prev" href={canonicalUrl(buildLocalityPagePath(params.slug, data.page - 1))} /> : null}
      {data.page < data.totalPages ? <link rel="next" href={canonicalUrl(buildLocalityPagePath(params.slug, data.page + 1))} /> : null}

      <h1 className="font-display text-4xl text-white">Properties for Rent and Sale in {data.locality}</h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-[#c8d3df]">{description}</p>

      <div className="mt-8 grid gap-4 rounded-[28px] border border-[#243040] bg-[#101722]/85 p-6 sm:grid-cols-4">
        <Stat label="Listings" value={String(data.total)} />
        <Stat label="Rent" value={String(data.stats.rent)} />
        <Stat label="Sale" value={String(data.stats.sale)} />
        <Stat label="Avg Rent / Sale" value={`${formatCurrencyShort(data.stats.avgRent, true)} · ${formatCurrencyShort(data.stats.avgSale)}`} />
      </div>

      <div className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
        {data.listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
      </div>

      <div className="mt-10 flex items-center justify-between text-sm text-[#b7c3d4]">
        <div>Page {data.page} of {data.totalPages}</div>
        <div className="flex gap-3">
          {data.page > 1 ? (
            <Link href={buildLocalityPagePath(params.slug, data.page - 1)} className="rounded-full border border-[#243040] px-4 py-2">← Prev</Link>
          ) : null}
          {data.page < data.totalPages ? (
            <Link href={buildLocalityPagePath(params.slug, data.page + 1)} className="rounded-full border border-[#243040] px-4 py-2">Next →</Link>
          ) : null}
        </div>
      </div>

      {nearby.length > 0 ? (
        <section className="mt-14">
          <h2 className="font-display text-2xl text-white">Nearby localities</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {nearby.map((locality) => (
              <Link key={locality} href={`/locality/${slugifyLocality(locality)}`} className="rounded-full border border-[#243040] px-4 py-2 text-sm text-[#d5dfeb]">
                {locality}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function buildLocalityPagePath(slug: string, page: number) {
  return page > 1 ? `/locality/${slug}?page=${page}` : `/locality/${slug}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#243040] bg-[#0d1117] p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-[#8ea2ba]">{label}</div>
      <div className="mt-2 text-lg text-white">{value}</div>
    </div>
  );
}
