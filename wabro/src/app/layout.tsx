import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Wabro - WhatsApp Broadcast",
  description: "Secure bulk messaging for WhatsApp",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://wabro.propai.live")
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-wa-bg text-wa-text font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
