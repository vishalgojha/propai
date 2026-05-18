import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import "../src/index.css";

export const metadata: Metadata = {
  title: "PropAI Pulse | Real-Time Off-Market Mumbai Real Estate",
  description:
    "Access Mumbai's off-market property inventory before it hits MagicBricks or 99acres. Sourced directly from real-time broker broadcasts using AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div
          className="flex min-h-screen flex-col font-sans selection:bg-[var(--accent)] selection:text-[var(--on-propai-green)] bg-[#090d12] text-[#e2e8f0]"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(62, 232, 138, 0.08), transparent 28%), radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.05), transparent 30%), linear-gradient(180deg, #090d12 0%, #090d12 100%)",
          }}
        >
          <PublicNav />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
