import type { MetadataRoute } from "next";
import { fetchPublicListings } from "@/lib/publicListings";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.propai.live";

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, priority: 1.0, changeFrequency: "hourly" },
    { url: `${baseUrl}/listings`, priority: 0.9, changeFrequency: "always" },
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

  return [...staticPages, ...listingPages];
}
