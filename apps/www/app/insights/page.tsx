import type { Metadata } from "next";
import Link from "next/link";
import {
  demandSignalClass,
  demandSignalLabel,
  fetchMarketInsights,
  formatDisplayDate,
  formatPriceRange,
  type MarketInsight,
} from "../../lib/market";
import { slugifyLocalityName, TOP_LOCALITIES } from "../../lib/localities";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Property Market Insights - PropAI Pulse",
  description:
    "Weekly property market snapshots by locality, including supply, requirements, price ranges, and demand signals.",
  alternates: {
    canonical: "https://www.propai.live/insights",
  },
};

export default async function Page() {
  const insights = await fetchMarketInsights(200);
  const grouped = groupByLocality(insights);

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 space-y-10">
      <section className="max-w-3xl space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Weekly market snapshots</p>
        <h1 className="text-[36px] md:text-[54px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
          Property Market Insights
        </h1>
        <p className="text-[15px] leading-7 text-[var(--text-secondary)]">
          Browse locality-level supply, requirement, price, and demand signals across Indian micro-markets.
        </p>
      </section>

      {grouped.length ? (
        <div className="space-y-10">
          {grouped.map(([locality, localityInsights]) => (
            <section key={locality} className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="text-[24px] font-bold text-[var(--text-primary)]">{locality}</h2>
                <Link
                  href={`/locality/${slugifyLocalityName(locality)}`}
                  className="text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] hover:underline"
                >
                  View live locality page
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {localityInsights.map((insight) => (
                  <InsightCard key={insight.slug} insight={insight} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-8">
          <h2 className="text-[22px] font-bold text-[var(--text-primary)]">Insights are being prepared</h2>
          <p className="mt-2 text-[14px] leading-6 text-[var(--text-secondary)]">
            Weekly snapshots will appear here after the first market insight run. Until then, browse live locality pages.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {TOP_LOCALITIES.slice(0, 8).map((locality) => (
              <Link
                key={locality.slug}
                href={`/locality/${locality.slug}`}
                className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-secondary)] hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
              >
                {locality.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: MarketInsight }) {
  return (
    <article className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <time className="text-[11px] font-medium text-[var(--text-muted)]" dateTime={insight.published_at}>
          {formatDisplayDate(insight.published_at)}
        </time>
        <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${demandSignalClass(insight.demand_signal)}`}>
          {demandSignalLabel(insight.demand_signal)}
        </span>
      </div>
      <h3 className="mt-4 text-[18px] font-bold leading-7 text-[var(--text-primary)]">
        <Link href={`/insights/${insight.slug}`} className="hover:text-[var(--accent)]">
          {insight.title}
        </Link>
      </h3>
      <p className="mt-3 line-clamp-3 text-[13px] leading-6 text-[var(--text-secondary)]">{insight.summary}</p>
      <div className="mt-5 grid grid-cols-3 gap-2 text-[11px]">
        <MiniStat label="Listings" value={String(insight.listing_count)} />
        <MiniStat label="Reqs" value={String(insight.requirement_count)} />
        <MiniStat label="Range" value={formatPriceRange(insight.min_price_numeric, insight.max_price_numeric)} />
      </div>
      <Link
        href={`/insights/${insight.slug}`}
        className="mt-5 inline-flex text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] hover:underline"
      >
        Read snapshot -&gt;
      </Link>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--bg-elevated)] p-3">
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 font-bold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function groupByLocality(insights: MarketInsight[]) {
  const map = new Map<string, MarketInsight[]>();
  for (const insight of insights) {
    if (!map.has(insight.locality)) map.set(insight.locality, []);
    map.get(insight.locality)!.push(insight);
  }
  return [...map.entries()];
}
