import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PropAI Pulse",
    short_name: "PropAI",
    description: "Mobile-first WhatsApp AI workspace for broker inventory, demand, and follow-up.",
    start_url: "/",
    display: "standalone",
    background_color: "#07111a",
    theme_color: "#07111a",
    orientation: "portrait",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
