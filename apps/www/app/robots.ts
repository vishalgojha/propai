import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/mcp",
        "/mcp/docs",
        "/mcp/security",
        "/mcp/manifest",
      ],
    },
    sitemap: [
      "https://www.propai.live/sitemap.xml",
      "https://www.propai.live/news-sitemap.xml",
    ],
  };
}
