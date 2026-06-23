import type { Metadata, Viewport } from "next";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { PWARegistration } from "@/components/PWARegistration";
import ThemeProvider from "@/components/ThemeProvider";
import "../src/index.css";

export const metadata: Metadata = {
  title: "PropAI Pulse | Live Broker-Network Real Estate",
  description:
    "Discover broker-listed property inventory and market intelligence for India's active real-estate markets.",
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
        <ThemeProvider>
          <PWARegistration />
          <div className="flex min-h-screen flex-col font-sans selection:bg-[var(--accent)] selection:text-[var(--on-propai-green)] bg-[var(--bg-base)] text-[var(--text-primary)]">
            <PublicNav />
            <main className="flex-1 pb-16 md:pb-0">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
