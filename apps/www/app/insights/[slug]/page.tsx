import type { Metadata } from "next";
import Link from "next/link";
import {
  demandSignalClass,
  demandSignalLabel,
  fetchInsightStreamItems,
  fetchMarketInsightBySlug,
  fetchMarketInsights,
  fetchRelatedInsights,
  formatDisplayDate,
  formatPriceRange,
  groupByBhk,
  groupRequirementsByBudget,
  splitSupplyDemand,
  type MarketInsight,
} from "../../../lib/market";
import { slugifyLocalityName } from "../../../lib/localities";

export const revalidate = 86400;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const insights = await fetchMarketInsights(50);
  return insights.map((insight) => ({ slug: insight.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const insight = await fetchMarketInsightBySlug(slug);

  if (!insight) {
    return {
      title: "Market insight - PropAI Pulse",
      description: "Weekly Mumbai property market insight from PropAI Pulse.",
      alternates: { canonical: `https://www.propai.live/insights/${slug}` },
    };
  }

  return {
    title: `${insight.title} - PropAI Pulse`,
    description: insight.summary,
    openGraph: {
      title: insight.title,
      description: insight.summary,
      type: "article",
      publishedTime: insight.published_at,
      authors: ["PropAI Pulse"],
      url: `https://www.propai.live/insights/${insight.slug}`,
    },
    alternates: {
      canonical: `https://www.propai.live/insights/${insight.slug}`,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const insight = await fetchMarketInsightBySlug(slug);

  if (!insight) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-24">
        <h1 className="text-[34px] font-bold text-[var(--text-primary)]">Market insight unavailable</h1>
        <p className="mt-4 text-[14px] leading-7 text-[var(--text-secondary)]">
          This weekly snapshot is not available yet. Browse the insights index for the latest published pages.
        </p>
        <Link href="/insights" className="mt-8 inline-flex text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] hover:underline">
          Back to insights
        </Link>
      </div>
    );
  }

  const periodItems = await fetchInsightStreamItems(insight.locality, insight.period_start, insight.period_end);
  const { listings, requirements } = splitSupplyDemand(periodItems);
  const listingsByBhk = groupByBhk(listings);
  const requirementsByBudget = groupRequirementsByBudget(requirements);
  const related = await fetchRelatedInsights(insight.locality, insight.slug, 3);
  const localitySlug = slugifyLocalityName(insight.locality);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: insight.title,
    description: insight.summary,
    datePublished: insight.published_at,
    dateModified: insight.published_at,
    author: {
      "@type": "Organization",
      name: "PropAI Pulse",
      url: "https://www.propai.live",
    },
    publisher: {
      "@type": "Organization",
      name: "PropAI Pulse",
      logo: {
        "@type": "ImageObject",
        url: "https://www.propai.live/icon.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://www.propai.live/insights/${insight.slug}`,
    },
  };

  return (
    <article className="mx-auto max-w-5xl px-5 py-12 space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <header className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          <Link href="/insights" className="hover:text-[var(--accent)]">Insights</Link>
          <span>/</span>
          <span>{insight.locality}</span>
          <span>/</span>
          <time dateTime={insight.published_at}>{formatDisplayDate(insight.published_at)}</time>
        </div>
        <h1 className="text-[34px] md:text-[52px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
          {insight.title}
        </h1>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Listings" value={String(insight.listing_count)} />
        <Stat label="Requirements" value={String(insight.requirement_count)} />
        <Stat label="Price range" value={formatPriceRange(insight.min_price_numeric, insight.max_price_numeric)} />
        <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Demand</div>
          <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${demandSignalClass(insight.demand_signal)}`}>
            {demandSignalLabel(insight.demand_signal)}
          </span>
        </div>
      </section>

      <p className="max-w-3xl text-[18px] leading-8 text-[var(--text-secondary)]">{insight.summary}</p>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <BreakdownTable title="Listings by BHK config" rows={listingsByBhk} empty="Listing breakdown is updating." />
        <BreakdownTable title="Requirements by budget range" rows={requirementsByBudget} empty="Requirement breakdown is updating." />
      </section>

      <section className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <Link href={`/locality/${localitySlug}`} className="text-[15px] font-bold text-[var(--accent)] hover:underline">
          View live listings in {insight.locality} -&gt;
        </Link>
      </section>

      <section className="space-y-4">
        <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Related insights</h2>
        {related.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {related.map((item) => (
              <Link
                key={item.slug}
                href={`/insights/${item.slug}`}
                className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-5 hover:border-[color:var(--accent-border)]"
              >
                <div className="text-[11px] text-[var(--text-muted)]">{formatDisplayDate(item.published_at)}</div>
                <h3 className="mt-3 text-[15px] font-bold leading-6 text-[var(--text-primary)]">{item.title}</h3>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--text-secondary)]">More weekly snapshots for {insight.locality} will appear here after publication.</p>
        )}
      </section>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 text-[18px] font-bold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function BreakdownTable({ title, rows, empty }: { title: string; rows: [string, number][]; empty: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)]">
      <h2 className="border-b border-[color:var(--border)] px-5 py-4 text-[18px] font-bold text-[var(--text-primary)]">{title}</h2>
      <table className="w-full border-collapse text-left text-[13px]">
        <tbody className="divide-y divide-[color:var(--border)]">
          {rows.length ? (
            rows.map(([label, count]) => (
              <tr key={label}>
                <td className="px-5 py-3 text-[var(--text-secondary)]">{label}</td>
                <td className="px-5 py-3 text-right font-bold text-[var(--text-primary)]">{count}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-5 py-6 text-[var(--text-secondary)]" colSpan={2}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
