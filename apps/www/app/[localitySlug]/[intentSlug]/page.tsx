import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatDisplayDateTime,
  formatPriceRange,
  formatPriceShort,
  formatTimeAgo,
  getMostCommonBhk,
  numericPrices,
} from "../../../lib/market";
import {
  filterLongTailItems,
  getLongTailCanonicalPath,
  getLongTailIntentBySlug,
  getLongTailLocalityName,
  getLongTailPageDescription,
  getLongTailPageTitle,
  getLongTailRelatedIntents,
  getLongTailStaticParams,
} from "../../../lib/longtail";
import { fetchLocalityStreamItems, type StreamMarketItem } from "../../../lib/market";
import { getLocalityBySlug, neighbouringLocalities } from "../../../lib/localities";

export const dynamic = "force-dynamic";
export const revalidate = 1800;

type PageProps = {
  params: Promise<{ localitySlug: string; intentSlug: string }>;
};

export async function generateStaticParams() {
  return getLongTailStaticParams();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { localitySlug, intentSlug } = await params;
  const localityName = getLongTailLocalityName(localitySlug);
  const intent = getLongTailIntentBySlug(intentSlug);

  if (!intent) {
    return { title: "Property search — PropAI Pulse" };
  }

  let listingCount = 0;
  let requirementCount = 0;
  try {
    const items = await fetchLocalityStreamItems(localityName, 30, 120);
    const filtered = filterLongTailItems(items, intent);
    listingCount = filtered.listings.length;
    requirementCount = filtered.requirements.length;
  } catch {
    listingCount = 0;
    requirementCount = 0;
  }

  const title = getLongTailPageTitle(localityName, intent);
  const description = getLongTailPageDescription(localityName, intent, listingCount, requirementCount);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "en_IN",
      url: `https://www.propai.live${getLongTailCanonicalPath(localitySlug, intentSlug)}`,
      siteName: "PropAI Pulse",
    },
    alternates: {
      canonical: `https://www.propai.live${getLongTailCanonicalPath(localitySlug, intentSlug)}`,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { localitySlug, intentSlug } = await params;
  const locality = getLocalityBySlug(localitySlug);
  if (!locality) {
    notFound();
  }
  const localityName = locality?.name || getLongTailLocalityName(localitySlug);
  const intent = getLongTailIntentBySlug(intentSlug);

  if (!intent) {
    notFound();
  }

  const items = await fetchLocalityStreamItems(localityName, 45, 120);
  const { listings, requirements } = filterLongTailItems(items, intent);
  const activeItems = listings.length ? listings : items;
  const prices = numericPrices(activeItems);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const lastUpdated = activeItems[0]?.created_at || items[0]?.created_at || null;
  const bhkConfig = getMostCommonBhk(activeItems);
  const relatedIntents = getLongTailRelatedIntents(intent.slug, 6);
  const relatedLocalities = neighbouringLocalities(localitySlug, 4);
  const title = getLongTailPageTitle(localityName, intent);
  const description = getLongTailPageDescription(localityName, intent, listings.length, requirements.length);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    description,
    numberOfItems: activeItems.length,
    itemListElement: activeItems.slice(0, 10).map((item: StreamMarketItem, index: number) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "RealEstateListing",
        name: `${item.bhk || bhkConfig} ${intent.label} in ${localityName}`,
        offers: {
          "@type": "Offer",
          price: item.price_numeric || undefined,
          priceCurrency: "INR",
        },
      },
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.propai.live/" },
      { "@type": "ListItem", position: 2, name: "Localities", item: "https://www.propai.live/localities" },
      { "@type": "ListItem", position: 3, name: localityName, item: `https://www.propai.live/locality/${localitySlug}` },
      {
        "@type": "ListItem",
        position: 4,
        name: intent.label,
        item: `https://www.propai.live${getLongTailCanonicalPath(localitySlug, intentSlug)}`,
      },
    ],
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 space-y-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <section className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          <Link href="/" className="hover:text-[var(--accent)]">Home</Link>
          <span>/</span>
          <Link href="/localities" className="hover:text-[var(--accent)]">Localities</Link>
          <span>/</span>
          <Link href={`/locality/${localitySlug}`} className="hover:text-[var(--accent)]">{localityName}</Link>
          <span>/</span>
          <span>{intent.label}</span>
        </div>
        <div className="max-w-4xl space-y-4">
          <h1 className="text-[34px] md:text-[52px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
            {intent.label} in {localityName}
          </h1>
          <p className="text-[15px] leading-7 text-[var(--text-secondary)] max-w-2xl">
            Live broker inventory from WhatsApp for {localityName}. This page is built for search, AI discovery, and brokers who want the active market view without digging through chat noise.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Live matches" value={(intent.requirementOnly ? requirements.length : listings.length).toLocaleString("en-IN")} />
        <StatCard label="Requirements" value={(intent.requirementOnly ? listings.length : requirements.length).toLocaleString("en-IN")} />
        <StatCard label="Price range" value={formatPriceRange(minPrice, maxPrice)} />
        <StatCard label="Last updated" value={formatDisplayDateTime(lastUpdated)} />
      </section>

      <section className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[22px] font-bold text-[var(--text-primary)]">Market signal</h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              {bhkConfig} is the most common size showing up in the live data for this search page.
            </p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]">
            Canonical long-tail page
          </span>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">
              {intent.requirementOnly ? "Requirements" : "Live matches"}
            </h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              Broker-sourced inventory that matches this search intent.
            </p>
          </div>
          <Link href={`/locality/${localitySlug}`} className="text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] hover:underline">
            View locality page
          </Link>
        </div>
        <div className="overflow-hidden rounded-lg border border-[color:var(--border)]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-[var(--bg-elevated)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">BHK</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Posted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)] bg-[var(--bg-surface)]">
              {(intent.requirementOnly ? requirements : listings).length ? (
                (intent.requirementOnly ? requirements : listings).slice(0, 40).map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{item.type || "Listing"}</td>
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{item.bhk || bhkConfig}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{item.price_label || formatPriceShort(item.price_numeric)}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{formatTimeAgo(item.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-[var(--text-secondary)]" colSpan={4}>
                    This search page is live, but the matching inventory is still being refreshed from WhatsApp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
          <h2 className="text-[22px] font-bold text-[var(--text-primary)]">
            {intent.requirementOnly ? "Available options" : "Requirements right now"}
          </h2>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {intent.requirementOnly
              ? "Available inventory that may satisfy this demand segment."
              : "What brokers are asking for in this search segment."}
          </p>
          <div className="mt-6 space-y-3">
            {(intent.requirementOnly ? listings : requirements).length ? (
              (intent.requirementOnly ? listings : requirements).slice(0, 8).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 border-b border-[color:var(--border)] pb-3 last:border-0">
                  <div>
                    <div className="text-[14px] font-semibold text-[var(--text-primary)]">
                      {item.bhk || bhkConfig} {intent.requirementOnly ? "option" : "requirement"}
                    </div>
                    <div className="text-[12px] text-[var(--text-secondary)]">{item.price_label || formatPriceShort(item.price_numeric)}</div>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)]">{formatTimeAgo(item.created_at)}</span>
                </div>
              ))
            ) : (
              <p className="text-[13px] text-[var(--text-secondary)]">
                No strong secondary-market records matched this exact search yet. That usually means the query is very specific or the market is still refreshing from WhatsApp.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
            <h2 className="text-[22px] font-bold text-[var(--text-primary)]">Sibling searches</h2>
            <div className="mt-5 grid grid-cols-1 gap-3">
              {relatedIntents.map((related) => (
                <Link
                  key={related.slug}
                  href={getLongTailCanonicalPath(localitySlug, related.slug)}
                  className="flex items-center justify-between rounded-md border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] font-semibold text-[var(--text-primary)] hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
                >
                  <span>{related.label}</span>
                  <span aria-hidden="true">-&gt;</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
            <h2 className="text-[22px] font-bold text-[var(--text-primary)]">Nearby localities</h2>
            <div className="mt-5 space-y-3">
              {relatedLocalities.map((market) => (
                <Link
                  key={market.slug}
                  href={getLongTailCanonicalPath(market.slug, intent.slug)}
                  className="flex items-center justify-between rounded-md border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] font-semibold text-[var(--text-primary)] hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
                >
                  <span>{market.name}</span>
                  <span aria-hidden="true">-&gt;</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-3 text-[22px] font-bold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
