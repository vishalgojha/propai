import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "../src/index.css";

export const metadata: Metadata = {
  title: "PropAI Pulse",
  description: "Multi-tenant WhatsApp AI for real estate brokers.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PropAI",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.png", sizes: "128x128", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07111a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Suspense fallback={null}>{children}</Suspense>
        </Providers>
      </body>
    </html>
  );
}
