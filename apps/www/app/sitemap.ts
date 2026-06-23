import type { MetadataRoute } from "next";
import { fetchPublicListings } from "@/lib/publicListings";
import { supabaseAdmin } from "../src/lib/supabase.server";
import { TOP_LOCALITIES } from "../lib/localities";
import { getLongTailStaticParams } from "../lib/longtail";
import { getAllBlogArticles } from "../lib/blog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.propai.live";

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, priority: 1.0, changeFrequency: "hourly" },
    { url: `${baseUrl}/listings`, priority: 0.9, changeFrequency: "always" },
    { url: `${baseUrl}/intelligence`, priority: 0.8, changeFrequency: "hourly" },
    { url: `${baseUrl}/localities`, priority: 0.85, changeFrequency: "daily" },
    { url: `${baseUrl}/mcp`, priority: 0.7, changeFrequency: "monthly" },
    { url: `${baseUrl}/mcp/docs`, priority: 0.7, changeFrequency: "monthly" },
    { url: `${baseUrl}/mcp/security`, priority: 0.6, changeFrequency: "monthly" },
    { url: `${baseUrl}/mcp/manifest`, priority: 0.5, changeFrequency: "monthly" },
    { url: `${baseUrl}/llms.txt`, priority: 0.5, changeFrequency: "monthly" },
    { url: `${baseUrl}/ai.txt`, priority: 0.5, changeFrequency: "monthly" },
    { url: `${baseUrl}/insights`, priority: 0.8, changeFrequency: "weekly" },
    { url: `${baseUrl}/blog`, priority: 0.7, changeFrequency: "weekly" },
    { url: `${baseUrl}/contact`, priority: 0.5 },
  ];

  let listingPages: MetadataRoute.Sitemap = [];
  try {
    const listings = await fetchPublicListings();
    listingPages = listings.map((l) => ({
      url: `${baseUrl}/listings/${l.slug}`,
      priority: 0.7,
      changeFrequency: "weekly" as const,
      lastModified: l.created_at,
    }));
  } catch {
    // If listings fetch fails, serve static pages only
  }

  const localityPages: MetadataRoute.Sitemap = TOP_LOCALITIES.map((locality) => ({
    url: `${baseUrl}/locality/${locality.slug}`,
    priority: 0.8,
    changeFrequency: "hourly" as const,
  }));

  const longTailPages: MetadataRoute.Sitemap = getLongTailStaticParams().map((page) => ({
    url: `${baseUrl}/${page.localitySlug}/${page.intentSlug}`,
    priority: 0.72,
    changeFrequency: "daily" as const,
  }));

  const blogPages: MetadataRoute.Sitemap = getAllBlogArticles().map((article) => ({
    url: `${baseUrl}/blog/${article.slug}`,
    priority: 0.65,
    changeFrequency: article.schema === "NewsArticle" ? ("monthly" as const) : ("yearly" as const),
    lastModified: article.date,
  }));

  let insightPages: MetadataRoute.Sitemap = [];
  try {
    if (supabaseAdmin) {
      const { data: insights, error } = await supabaseAdmin
        .from("market_insights")
        .select("slug, published_at")
        .order("published_at", { ascending: false })
        .limit(200);

      if (!error) {
        insightPages = ((insights || []) as any[]).map((insight) => ({
          url: `${baseUrl}/insights/${insight.slug}`,
          priority: 0.7,
          changeFrequency: "never" as const,
          lastModified: insight.published_at,
        }));
      }
    }
  } catch {
    // If insights fetch fails, keep sitemap generation alive.
  }

  return [...staticPages, ...listingPages, ...localityPages, ...longTailPages, ...blogPages, ...insightPages];
}
