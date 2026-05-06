import type { MetadataRoute } from "next";
import { getAllListings, getAllLocalitySlugs } from "@/lib/listings";
import { siteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, localities] = await Promise.all([
    getAllListings(),
    getAllLocalitySlugs()
  ]);

  return [
    { url: `${siteUrl}/`, priority: 1, changeFrequency: "hourly" },
    { url: `${siteUrl}/listings`, priority: 0.9, changeFrequency: "hourly" },
    ...listings.map((listing) => ({
      url: `${siteUrl}/listings/${listing.id}`,
      priority: 0.7,
      lastModified: listing.updatedAt || listing.createdAt
    })),
    ...localities.map((slug) => ({
      url: `${siteUrl}/locality/${slug}`,
      priority: 0.8,
      changeFrequency: "hourly" as const
    }))
  ];
}
