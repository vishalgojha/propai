import type { Metadata } from 'next';
import { Quicksand } from 'next/font/google';
import './globals.css';

const quicksand = Quicksand({ 
    subsets: ['latin'],
    variable: '--font-quicksand',
});

export const metadata: Metadata = {
  title: 'PropAI Sync',
  description: 'Next-gen WhatsApp automation for real estate brokers',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${quicksand.variable} font-sans bg-black text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
