import type { Metadata } from "next";
import Link from "next/link";
import {
  demandSignalClass,
  fetchLocalityStreamItems,
  formatDisplayDateTime,
  formatPriceRange,
  formatPriceShort,
  formatTimeAgo,
  getMostCommonBhk,
  isRequirementType,
  numericPrices,
  splitSupplyDemand,
  type StreamMarketItem,
} from "../../../lib/market";
import {
  getLocalityBySlug,
  localityNameFromSlug,
  neighbouringLocalities,
  TOP_LOCALITIES,
} from "../../../lib/localities";
import {
  getLongTailCanonicalPath,
  getLongTailRelatedIntents,
} from "../../../lib/longtail";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return TOP_LOCALITIES.map((locality) => ({ slug: locality.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const localityName = localityNameFromSlug(slug);
  let listingCount = 0;

  try {
    const items = await fetchLocalityStreamItems(localityName, 30, 100);
    listingCount = splitSupplyDemand(items).listings.length;
  } catch {
    listingCount = 0;
  }

  const title = `Property listings in ${localityName} - PropAI Pulse`;
  const description = `Browse ${listingCount} live broker-verified listings and requirements in ${localityName}. Updated continuously. Rentals, sales, and more.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "en_IN",
      url: `https://www.propai.live/locality/${slug}`,
      siteName: "PropAI Pulse",
    },
    alternates: {
      canonical: `https://www.propai.live/locality/${slug}`,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const locality = getLocalityBySlug(slug);
  const localityName = locality?.name || localityNameFromSlug(slug);
  const items = await fetchLocalityStreamItems(localityName, 30, 100);
  const { listings, requirements } = splitSupplyDemand(items);
  const prices = numericPrices(listings.length ? listings : items);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const lastUpdated = items[0]?.created_at || null;
  const bhkConfig = getMostCommonBhk(listings.length ? listings : items);
  const signal = requirements.length > listings.length ? "high_demand" : "active";
  const neighbours = neighbouringLocalities(slug, 4);
  const relatedMarkets = await Promise.all(
    neighbours.slice(0, 4).map(async (market) => {
      const relatedItems = await fetchLocalityStreamItems(market.name, 30, 50);
      const { listings: relatedListings, requirements: relatedRequirements } = splitSupplyDemand(relatedItems);
      return {
        ...market,
        listings: relatedListings.length,
        requirements: relatedRequirements.length,
        latestAt: relatedItems[0]?.created_at || null,
      };
    }),
  );
  const faqAverageRent = averageTwoBhkRent(listings);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Property listings in ${localityName}`,
    description: `Live broker-verified listings in ${localityName}`,
    numberOfItems: listings.length,
    itemListElement: listings.slice(0, 10).map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "RealEstateListing",
        name: `${formatBhk(item.bhk)} ${item.type || "property"} in ${localityName}`,
        offers: {
          "@type": "Offer",
          price: item.price_numeric || undefined,
          priceCurrency: "INR",
        },
      },
    })),
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 space-y-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      <section className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          <Link href="/insights" className="hover:text-[var(--accent)]">
            Market insights
          </Link>
          <span>/</span>
          <span>{localityName}</span>
        </div>
        <div className="max-w-4xl space-y-4">
          <h1 className="text-[34px] md:text-[52px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
            {bhkConfig} flats in {localityName} - Live listings &amp; requirements
          </h1>
          <p className="text-[15px] leading-7 text-[var(--text-secondary)] max-w-2xl">
            Hourly refreshed supply and demand signals for {localityName}, with active listings,
            current requirements, price movement, and nearby bounce-off markets.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Live listings" value={listings.length.toLocaleString("en-IN")} />
        <StatCard label="Requirements" value={requirements.length.toLocaleString("en-IN")} />
        <StatCard label="Price range" value={formatPriceRange(minPrice, maxPrice)} />
        <StatCard label="Last updated" value={formatDisplayDateTime(lastUpdated)} />
      </section>

      <section className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[22px] font-bold text-[var(--text-primary)]">Market signal</h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              Computed from active supply and demand in the last 30 days.
            </p>
          </div>
          <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${demandSignalClass(signal)}`}>
            {signal === "high_demand" ? "High Demand" : "Active Market"}
          </span>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Live listings</h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              Latest active supply in {localityName}. Broker names are hidden on public pages.
            </p>
          </div>
          <Link href="/listings" className="text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] hover:underline">
            Browse all listings
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
              {listings.length ? (
                listings.slice(0, 40).map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3"><TypeBadge type={item.type} /></td>
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{formatBhk(item.bhk)}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{item.price_label || formatPriceShort(item.price_numeric)}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{formatTimeAgo(item.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-[var(--text-secondary)]" colSpan={4}>
                    Live listing data for {localityName} is being refreshed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
          <h2 className="text-[22px] font-bold text-[var(--text-primary)]">Requirements right now</h2>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            What buyers and renters are actively looking for in {localityName}.
          </p>
          <div className="mt-6 space-y-3">
            {requirements.length ? (
              requirements.slice(0, 8).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 border-b border-[color:var(--border)] pb-3 last:border-0">
                  <div>
                    <div className="text-[14px] font-semibold text-[var(--text-primary)]">{formatBhk(item.bhk)} requirement</div>
                    <div className="text-[12px] text-[var(--text-secondary)]">{item.price_label || formatPriceShort(item.price_numeric)}</div>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)]">{formatTimeAgo(item.created_at)}</span>
                </div>
              ))
            ) : (
              <p className="text-[13px] text-[var(--text-secondary)]">
                Requirement data is updating. Demand usually varies by budget, building condition, and commute access.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
          <h2 className="text-[22px] font-bold text-[var(--text-primary)]">Nearby localities</h2>
          <div className="mt-5 space-y-3">
            {neighbours.map((neighbour) => (
              <Link
                key={neighbour.slug}
                href={`/locality/${neighbour.slug}`}
                className="flex items-center justify-between rounded-md border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] font-semibold text-[var(--text-primary)] hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
              >
                <span>{neighbour.name}</span>
                <span aria-hidden="true">-&gt;</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Bounce-off markets</h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              These are the markets brokers usually cross-check when a deal in {localityName} is not a fit.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {relatedMarkets.map((market) => (
            <Link
              key={market.slug}
              href={`/locality/${market.slug}`}
              className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-5 transition-colors hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-elevated)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[16px] font-bold text-[var(--text-primary)]">{market.name}</h3>
                  <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                    {market.listings} listings · {market.requirements} requirements
                  </p>
                </div>
                <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Open
                </span>
              </div>
              <div className="mt-4 text-[12px] text-[var(--text-muted)]">
                Last active {formatDisplayDateTime(market.latestAt)}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Popular searches in this market</h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              These are the long-tail pages search engines can index directly for {localityName}.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {getLongTailRelatedIntents("2-bhk-rent", 6).map((intent) => (
            <Link
              key={intent.slug}
              href={getLongTailCanonicalPath(slug, intent.slug)}
              className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-4 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
            >
              {intent.label} in {localityName}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-[24px] font-bold text-[var(--text-primary)]">FAQ</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FaqItem
            question={`What is the average rent for a 2 BHK in ${localityName}?`}
            answer={
              faqAverageRent
                ? `Recent 2 BHK rental signals in ${localityName} average around ${formatPriceShort(faqAverageRent)} per month, depending on furnishing, building grade, and exact lane.`
                : `2 BHK rents in ${localityName} vary by building quality, furnishing, parking, and distance from transit. Live rent data is refreshed as new verified inventory appears.`
            }
          />
          <FaqItem
            question={`Are there ready-to-move flats available in ${localityName}?`}
            answer={
              listings.length
                ? `Yes. PropAI Pulse is currently tracking ${listings.length} active listing${listings.length === 1 ? "" : "s"} in ${localityName}, including newly posted rental and sale options.`
                : `Ready-to-move availability changes quickly in ${localityName}. Check the live listings table above or nearby localities while this page refreshes.`
            }
          />
          <FaqItem
            question={`How is the demand for property in ${localityName} right now?`}
            answer={
              requirements.length > listings.length
                ? `${localityName} is showing High Demand because active requirements are ahead of visible supply in the latest 30-day window.`
                : `${localityName} is showing an Active Market with ongoing supply and requirement activity in the latest 30-day window.`
            }
          />
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 text-[20px] font-bold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function TypeBadge({ type }: { type?: string | null }) {
  const normalized = isRequirementType(type) ? "Requirement" : type || "Listing";
  const className = isRequirementType(type)
    ? "bg-blue-500/10 text-blue-300"
    : String(type || "").toLowerCase().includes("rent")
      ? "bg-[var(--accent-glow)] text-[var(--accent)]"
      : "bg-amber-500/10 text-amber-300";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${className}`}>
      {normalized}
    </span>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
      <h3 className="text-[15px] font-bold leading-6 text-[var(--text-primary)]">{question}</h3>
      <p className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)]">{answer}</p>
    </div>
  );
}

function formatBhk(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "Flexible";
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (match) return `${match[1]} BHK`;
  return text;
}

function averageTwoBhkRent(items: StreamMarketItem[]) {
  const rents = items
    .filter((item) => String(item.type || "").toLowerCase().includes("rent"))
    .filter((item) => /2\s*bhk/i.test(String(item.bhk || "")))
    .map((item) => item.price_numeric)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  if (!rents.length) return null;
  return Math.round(rents.reduce((sum, value) => sum + value, 0) / rents.length);
}
