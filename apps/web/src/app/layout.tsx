import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'stackprobe',
  description: 'See what a product is built on, with the evidence for every finding.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <a href="/" className="brand">
            stackprobe
          </a>
          {children}
        </main>
      </body>
    </html>
  );
}
