import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PropAI - Mumbai Property Listings',
  description: 'Discover verified property listings in Mumbai. Search flats, apartments, and homes for rent and sale in all Mumbai localities.',
  openGraph: {
    title: 'PropAI - Mumbai Property Listings',
    description: 'Discover verified property listings in Mumbai',
    type: 'website',
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
