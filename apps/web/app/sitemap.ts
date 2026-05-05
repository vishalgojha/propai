import { MetadataRoute } from 'next';
import { getPublicSitemapFeed } from '@/app/lib/publicListingsService';

const BASE_URL = 'https://www.propai.live';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { areas, listingIds } = await getPublicSitemapFeed();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/mumbai`,
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];

  const areaRoutes: MetadataRoute.Sitemap = areas.flatMap((area) =>
    ['ALL', 'rent', 'sale', 'requirement'].map((type) => ({
      url: `${BASE_URL}/mumbai/${encodeURIComponent(area)}/${type}`,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }))
  );

  const listingRoutes: MetadataRoute.Sitemap = listingIds.map((id) => ({
    url: `${BASE_URL}/listings/${id}`,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...areaRoutes, ...listingRoutes];
}
