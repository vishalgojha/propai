import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Syne } from "next/font/google";
import "@/app/globals.css";
import { PublicNav } from "@/components/public-nav";
import { Footer } from "@propai/theme";
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
  title: "PropAI — Fresh Property Listings Directly from Broker WhatsApp Networks in Mumbai",
  description: "Discover verified flats, apartments, offices, shops, and commercial properties for rent and sale in Mumbai, Bandra West, Powai, Andheri, Worli, Thane, and 48+ MMR localities. Listings appear minutes after brokers post on WhatsApp — not days later. Direct broker contact via WhatsApp.",
  keywords: [
    "property listings Mumbai", "flats for rent Mumbai", "apartments for sale Mumbai",
    "broker WhatsApp network", "real estate Mumbai", "Bandra West flats",
    "Powai apartments rent", "Andheri property sale", "Worli sea view apartment",
    "Thane ready possession", "office space BKC", "commercial property Mumbai",
    "2BHK Bandra West", "3BHK Powai", "1BHK Andheri rent",
    "Mumbai real estate broker", "verified property listings", "fresh inventory Mumbai",
    "broker friendly platform", "MMR property search", "direct from broker WhatsApp"
  ].join(", "),
  alternates: {
    canonical: canonicalUrl("/")
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: "PropAI — Fresh Property Listings Directly from Broker WhatsApp Networks",
    description: "Discover verified flats, apartments, offices, shops, and commercial properties for rent and sale across 48+ Mumbai localities. Direct broker contact via WhatsApp.",
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
          <Footer />
        </div>
      </body>
    </html>
  );
}
