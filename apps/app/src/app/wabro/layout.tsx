import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';
import '@/lib/api';

export const metadata: Metadata = {
  title: 'Wabro - WhatsApp Broadcast',
  description: 'Secure bulk messaging for WhatsApp',
};

export default function WabroLayout({
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
