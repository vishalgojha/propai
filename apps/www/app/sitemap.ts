import type { MetadataRoute } from "next";
import { getAllListings, getAllLocalitySlugs } from "@/lib/listings";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fallbackEntries: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, priority: 1, changeFrequency: "hourly" },
    { url: `${siteUrl}/listings`, priority: 0.9, changeFrequency: "hourly" }
  ];

  try {
    const [listings, localities] = await Promise.all([
      getAllListings(),
      getAllLocalitySlugs()
    ]);

    return [
      ...fallbackEntries,
      ...listings.map((listing) => ({
        url: `${siteUrl}/listings/${listing.slug}`,
        priority: 0.7,
        lastModified: listing.updatedAt || listing.createdAt
      })),
      ...localities.map((slug) => ({
        url: `${siteUrl}/locality/${slug}`,
        priority: 0.8,
        changeFrequency: "hourly" as const
      }))
    ];
  } catch (error) {
    console.error("Failed to generate sitemap entries from listings", error);
    return fallbackEntries;
  }
}
