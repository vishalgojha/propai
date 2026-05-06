import type { MetadataRoute } from "next";
import { getAllListingIds, getAllLocalitySlugs, getAllListings } from "@/lib/listings";
import { siteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [ids, localities, listings] = await Promise.all([
    getAllListingIds(),
    getAllLocalitySlugs(),
    getAllListings()
  ]);

  const listingMap = new Map(listings.map((listing) => [listing.id, listing]));

  return [
    { url: `${siteUrl}/`, priority: 1, changeFrequency: "hourly" },
    { url: `${siteUrl}/listings`, priority: 0.9, changeFrequency: "hourly" },
    ...ids.map((id) => ({
      url: `${siteUrl}/listings/${id}`,
      priority: 0.7,
      lastModified: listingMap.get(id)?.updatedAt || listingMap.get(id)?.createdAt
    })),
    ...localities.map((slug) => ({
      url: `${siteUrl}/locality/${slug}`,
      priority: 0.8,
      changeFrequency: "hourly" as const
    }))
  ];
}
