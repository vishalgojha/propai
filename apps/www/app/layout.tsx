import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import ThemeProvider from "@/components/ThemeProvider";
import "../src/index.css";

export const metadata: Metadata = {
  title: "PropAI Pulse | Real-Time Off-Market Mumbai Real Estate",
  description:
    "Access Mumbai's off-market property inventory before it hits MagicBricks or 99acres. Sourced directly from real-time broker broadcasts using AI.",
  metadataBase: new URL("https://www.propai.live"),
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <div className="flex min-h-screen flex-col font-sans selection:bg-[var(--accent)] selection:text-[var(--on-propai-green)] bg-[var(--bg-base)] text-[var(--text-primary)]">
            <PublicNav />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
