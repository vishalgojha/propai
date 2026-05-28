import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PropAI Pulse",
    short_name: "PropAI",
    description: "Mobile-first WhatsApp-powered real estate discovery for brokers and buyers.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07111a",
    theme_color: "#07111a",
    orientation: "portrait-primary",
    categories: ["business", "productivity", "real estate"],
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
