import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
  let urls = "";

  try {
    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { data: insights, error } = await supabase
        .from("market_insights")
        .select("slug, title, published_at")
        .gte("published_at", twoDaysAgo)
        .order("published_at", { ascending: false });

      if (!error) {
        urls = ((insights || []) as any[])
          .map(
            (insight) => `
  <url>
    <loc>https://www.propai.live/insights/${escapeXml(insight.slug)}</loc>
    <news:news>
      <news:publication>
        <news:name>PropAI Pulse</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(insight.published_at)}</news:publication_date>
      <news:title>${escapeXml(insight.title)}</news:title>
    </news:news>
  </url>`
          )
          .join("");
      }
    }
  } catch {
    urls = "";
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
