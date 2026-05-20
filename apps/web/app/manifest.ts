import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PropAI Listings",
    short_name: "PropAI",
    description: "Mobile-friendly Mumbai property listings with installable search and WhatsApp lead follow-up.",
    start_url: "/mumbai",
    scope: "/",
    display: "standalone",
    background_color: "#fbf7f0",
    theme_color: "#fbf7f0",
    orientation: "portrait",
    categories: ["business", "lifestyle", "real-estate"],
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
