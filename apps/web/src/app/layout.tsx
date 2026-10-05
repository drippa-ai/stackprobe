import type { Metadata } from 'next';
import { Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { SiteFooter } from './site-chrome.tsx';
import './globals.css';

const sans = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'stackprobe',
  description: 'See what a product is built on, with the evidence for every finding.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
