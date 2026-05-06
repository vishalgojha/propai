import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Syne } from "next/font/google";
import "@/app/globals.css";
import { PublicNav } from "@/components/public-nav";
import { canonicalUrl, siteUrl } from "@/lib/site";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap"
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "PropAI — Verified Property Search Across Broker Networks",
  description: "Search verified flats, offices, shops and commercial listings sourced from active broker WhatsApp networks across key Indian markets.",
  alternates: {
    canonical: canonicalUrl("/")
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: "PropAI — Verified Property Search Across Broker Networks",
    description: "Search verified flats, offices, shops and commercial listings sourced from active broker WhatsApp networks across key Indian markets.",
    url: canonicalUrl("/"),
    type: "website"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${syne.variable}`}>
      <body className="font-sans">
        <div className="site-shell">
          <PublicNav />
          {children}
        </div>
      </body>
    </html>
  );
}
