import type { Metadata } from "next";
import Link from "next/link";
import { getAllBlogArticles } from "../../lib/blog";
import { formatDisplayDate } from "../../lib/market";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Mumbai Real Estate Insights & Guides - PropAI Pulse",
  description:
    "Guides and analysis on Mumbai real estate, locality demand, broker activity, stale listings, and rental market trends.",
  alternates: {
    canonical: "https://www.propai.live/blog",
  },
};

export default function Page() {
  const articles = getAllBlogArticles();

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 space-y-10">
      <section className="max-w-3xl space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Guides and analysis</p>
        <h1 className="text-[36px] md:text-[54px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
          Mumbai Real Estate Insights &amp; Guides
        </h1>
        <p className="text-[15px] leading-7 text-[var(--text-secondary)]">
          Practical explainers for Mumbai buyers, renters, brokers, and market watchers.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {articles.map((article) => (
          <article key={article.slug} className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <time dateTime={article.date}>{formatDisplayDate(article.date)}</time>
              <span>/</span>
              <span>{article.readingTime}</span>
              <span>/</span>
              <span>{article.wordCount.toLocaleString("en-IN")} words</span>
            </div>
            <h2 className="mt-4 text-[22px] font-bold leading-8 text-[var(--text-primary)]">
              <Link href={`/blog/${article.slug}`} className="hover:text-[var(--accent)]">
                {article.title}
              </Link>
            </h2>
            <p className="mt-3 text-[14px] leading-7 text-[var(--text-secondary)]">{article.excerpt}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {tag}
                </span>
              ))}
            </div>
            <Link href={`/blog/${article.slug}`} className="mt-6 inline-flex text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] hover:underline">
              Read guide -&gt;
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}
