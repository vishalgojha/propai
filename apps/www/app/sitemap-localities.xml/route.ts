import { TOP_LOCALITIES } from "../../lib/localities";
import { getLongTailStaticParams } from "../../lib/longtail";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = "https://www.propai.live";
  const urls = [
    `${baseUrl}/localities`,
    ...TOP_LOCALITIES.map((locality) => `${baseUrl}/locality/${locality.slug}`),
    ...getLongTailStaticParams().map((page) => `${baseUrl}/${page.localitySlug}/${page.intentSlug}`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url}</loc>
    <changefreq>daily</changefreq>
    <priority>${url.includes("/locality/") ? "0.8" : url.endsWith("/localities") ? "0.9" : "0.7"}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
