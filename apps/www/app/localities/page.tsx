import type { Metadata } from "next";
import Link from "next/link";
import { fetchLocalitiesForFooter } from "@/lib/publicListings";
import { getLongTailCanonicalPath, getLongTailRelatedIntents } from "../../lib/longtail";
import { TOP_LOCALITIES } from "../../lib/localities";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const canonical = "https://www.propai.live/localities";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Browse Localities | PropAI Pulse";
  const description =
    "Browse PropAI Pulse locality pages, market belts, and canonical long-tail search pages across Mumbai, Thane, Navi Mumbai, and Pune.";

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "en_IN",
      url: canonical,
      siteName: "PropAI Pulse",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function LocalitiesPage() {
  const cityGroups = await fetchLocalitiesForFooter(1);
  const visibleCityGroups = cityGroups.length > 0 ? cityGroups : fallbackCityGroups();
  const localityCountMap = new Map(
    visibleCityGroups.flatMap((group) => group.localities.map((loc) => [loc.slug, loc.count] as const)),
  );
  const topLocalities = TOP_LOCALITIES.slice(0, 10).map((locality) => ({
    ...locality,
    count: localityCountMap.get(locality.slug) || 0,
  }));
  const localityIntentLinks = TOP_LOCALITIES.slice(0, 12).flatMap((locality) =>
    getLongTailRelatedIntents("2-bhk-rent", 4).map((intent) => ({
      locality,
      intent,
    })),
  );

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Browse Localities",
    description: "Index of PropAI Pulse locality pages and public long-tail market pages.",
    url: canonical,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: TOP_LOCALITIES.length,
      itemListElement: TOP_LOCALITIES.map((locality, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `https://www.propai.live/locality/${locality.slug}`,
        name: locality.name,
      })),
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.propai.live/" },
      { "@type": "ListItem", position: 2, name: "Localities", item: canonical },
    ],
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 space-y-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          <Link href="/" className="hover:text-[var(--accent)]">
            Home
          </Link>
          <span>/</span>
          <span>Localities</span>
        </div>
        <div className="max-w-4xl space-y-4">
          <h1 className="text-[34px] font-bold tracking-tight text-[var(--text-primary)] md:text-[52px]">
            Browse localities
          </h1>
          <p className="max-w-2xl text-[15px] leading-7 text-[var(--text-secondary)]">
            This hub links every public locality page and the search pages brokers and crawlers can use to move from a market belt into a canonical long-tail page.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">How to browse</div>
          <h2 className="mt-2 text-[20px] font-bold text-[var(--text-primary)]">Start with the city, then the belt, then the exact market.</h2>
          <p className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)]">
            If you know the area, open the locality page directly. If you know the need, use a long-tail page like rent, sale, office, or requirement. The hub keeps both paths linked.
          </p>
        </div>
        <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">What this page shows</div>
          <h2 className="mt-2 text-[20px] font-bold text-[var(--text-primary)]">Public locality pages, market belts, and canonical search pages.</h2>
          <p className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)]">
            The directory is built for humans, Google, and AI assistants. It stays public-safe while still linking the right market layers together.
          </p>
        </div>
        <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Top markets</div>
          <h2 className="mt-2 text-[20px] font-bold text-[var(--text-primary)]">The first 10 localities get the strongest directory exposure.</h2>
          <p className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)]">
            These are the markets most likely to have live inventory, nearby fallback belts, and long-tail pages ready for indexing.
          </p>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[22px] font-bold text-[var(--text-primary)]">Priority locality blocks</h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              The highest-priority locality pages, shown with live public counts when available.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {topLocalities.map((locality) => (
            <Link
              key={locality.slug}
              href={`/locality/${locality.slug}`}
              className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-5 transition-colors hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-elevated)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[16px] font-bold text-[var(--text-primary)]">{locality.name}</h3>
                  <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                    {locality.count} live item{locality.count === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-base)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Top
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {getLongTailRelatedIntents("2-bhk-rent", 3).map((intent) => (
                  <span
                    key={intent.slug}
                    className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]"
                  >
                    {intent.label}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visibleCityGroups.map((cityGroup) => (
          <div key={cityGroup.city} className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{cityGroup.city}</div>
            <div className="mt-4 space-y-3">
              {cityGroup.localities.map((loc) => (
                <div key={loc.slug} className="rounded-md border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/locality/${loc.slug}`} className="text-[14px] font-bold text-[var(--text-primary)] hover:text-[var(--accent)]">
                        {loc.name}
                      </Link>
                      <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                        {loc.count} live item{loc.count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      Locality
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {loc.related.slice(0, 3).map((related) => (
                      <Link
                        key={related.slug}
                        href={`/locality/${related.slug}`}
                        className="rounded-full border border-[color:var(--border)] bg-[var(--bg-base)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)] hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
                      >
                        {related.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[22px] font-bold text-[var(--text-primary)]">Canonical long-tail pages</h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              These are the search pages that connect a locality into specific broker intent, like rent, sale, office, or requirement searches.
            </p>
          </div>
          <Link href="/listings" className="text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] hover:underline">
            Browse live listings
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {localityIntentLinks.map(({ locality, intent }) => (
            <Link
              key={`${locality.slug}-${intent.slug}`}
              href={getLongTailCanonicalPath(locality.slug, intent.slug)}
              className="rounded-md border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
            >
              {intent.label} in {locality.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function fallbackCityGroups() {
  const buckets = new Map<string, { city: string; localities: { name: string; slug: string; count: number; related: { name: string; slug: string; count: number }[] }[] }>();
  for (const locality of TOP_LOCALITIES) {
    const city = inferCity(locality.slug);
    if (!buckets.has(city)) buckets.set(city, { city, localities: [] });
    buckets.get(city)!.localities.push({
      name: locality.name,
      slug: locality.slug,
      count: 1,
      related: [],
    });
  }
  return Array.from(buckets.values());
}

function inferCity(slug: string) {
  if (slug.startsWith("thane")) return "Thane";
  if (slug.startsWith("vashi") || slug.startsWith("nerul") || slug.startsWith("kharghar") || slug.startsWith("panvel")) return "Navi Mumbai";
  if (slug.startsWith("wakad") || slug.startsWith("baner") || slug.startsWith("hinjewadi") || slug.startsWith("aundh") || slug.startsWith("kharadi")) return "Pune";
  return "Mumbai";
}
