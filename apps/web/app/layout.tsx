import type { Metadata, Viewport } from "next";
import { PWARegistration } from "@/app/components/PWARegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "PropAI - Mumbai Property Listings",
  description: "Discover verified property listings in Mumbai. Search flats, apartments, and homes for rent and sale in all Mumbai localities.",
  metadataBase: new URL("https://www.propai.live"),
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PropAI",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.svg",
    apple: "/apple-icon",
  },
  openGraph: {
    title: "PropAI - Mumbai Property Listings",
    description: "Discover verified property listings in Mumbai",
    type: 'website',
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf7f0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PWARegistration />
        {children}
      </body>
    </html>
  );
}
