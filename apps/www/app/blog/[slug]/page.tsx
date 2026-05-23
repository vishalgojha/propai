import type { Metadata } from "next";
import Link from "next/link";
import React from "react";
import { getAllBlogArticles, getBlogArticle, type BlogArticle } from "../../../lib/blog";
import { formatDisplayDate } from "../../../lib/market";

export const revalidate = 86400;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getAllBlogArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getBlogArticle(slug);

  if (!article) {
    return {
      title: "Mumbai real estate guide - PropAI Pulse",
      description: "Mumbai real estate guides and analysis from PropAI Pulse.",
      alternates: { canonical: `https://www.propai.live/blog/${slug}` },
    };
  }

  return {
    title: `${article.title} - PropAI Pulse`,
    description: article.excerpt,
    openGraph: {
      title: article.title,
      description: article.excerpt,
      type: article.schema === "NewsArticle" ? "article" : "website",
      publishedTime: article.date,
      authors: ["PropAI Pulse"],
      url: `https://www.propai.live/blog/${article.slug}`,
    },
    alternates: {
      canonical: `https://www.propai.live/blog/${article.slug}`,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const article = getBlogArticle(slug);

  if (!article) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-24">
        <h1 className="text-[34px] font-bold text-[var(--text-primary)]">Article unavailable</h1>
        <p className="mt-4 text-[14px] leading-7 text-[var(--text-secondary)]">
          This guide is not available. Browse the blog index for current articles.
        </p>
        <Link href="/blog" className="mt-8 inline-flex text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] hover:underline">
          Back to blog
        </Link>
      </div>
    );
  }

  const articleJsonLd = buildArticleJsonLd(article);
  const faqJsonLd = article.faqs.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: article.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      }
    : null;

  return (
    <article className="mx-auto max-w-3xl px-5 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}

      <div className="mb-8 flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--text-muted)]">
        <Link href="/blog" className="font-bold uppercase tracking-[0.12em] hover:text-[var(--accent)]">Blog</Link>
        <span>/</span>
        <time dateTime={article.date}>{formatDisplayDate(article.date)}</time>
        <span>/</span>
        <span>{article.readingTime}</span>
      </div>

      <MarkdownContent content={article.content} />
    </article>
  );
}

function buildArticleJsonLd(article: BlogArticle) {
  return {
    "@context": "https://schema.org",
    "@type": article.schema,
    headline: article.title,
    description: article.excerpt,
    datePublished: article.date,
    dateModified: article.date,
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
      "@id": `https://www.propai.live/blog/${article.slug}`,
    },
    wordCount: article.wordCount,
    timeRequired: article.readingTime,
  };
}

function MarkdownContent({ content }: { content: string }) {
  return <div className="space-y-6">{renderMarkdown(content)}</div>;
}

function renderMarkdown(content: string) {
  const nodes: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    nodes.push(
      <p key={`p-${nodes.length}`} className="text-[15px] leading-8 text-[var(--text-secondary)]">
        {renderInline(text)}
      </p>
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="list-disc space-y-2 pl-6 text-[15px] leading-8 text-[var(--text-secondary)]">
        {listItems.map((item, index) => (
          <li key={`${item}-${index}`}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^#\s+/.test(line)) {
      flushParagraph();
      flushList();
      nodes.push(
        <h1 key={`h1-${nodes.length}`} className="text-[34px] md:text-[46px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
          {renderInline(line.replace(/^#\s+/, ""))}
        </h1>
      );
      continue;
    }

    if (/^##\s+/.test(line)) {
      flushParagraph();
      flushList();
      nodes.push(
        <h2 key={`h2-${nodes.length}`} className="pt-6 text-[26px] font-bold leading-9 text-[var(--text-primary)]">
          {renderInline(line.replace(/^##\s+/, ""))}
        </h2>
      );
      continue;
    }

    if (/^###\s+/.test(line)) {
      flushParagraph();
      flushList();
      nodes.push(
        <h3 key={`h3-${nodes.length}`} className="pt-2 text-[18px] font-bold leading-7 text-[var(--text-primary)]">
          {renderInline(line.replace(/^###\s+/, ""))}
        </h3>
      );
      continue;
    }

    if (/^-\s+/.test(line)) {
      flushParagraph();
      listItems.push(line.replace(/^-\s+/, ""));
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return nodes;
}

function renderInline(text: string) {
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const label = match[1];
    const href = match[2];
    parts.push(
      href.startsWith("/") ? (
        <Link key={`${href}-${match.index}`} href={href} className="font-semibold text-[var(--accent)] hover:underline">
          {label}
        </Link>
      ) : (
        <a key={`${href}-${match.index}`} href={href} className="font-semibold text-[var(--accent)] hover:underline">
          {label}
        </a>
      )
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
