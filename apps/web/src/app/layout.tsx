import type { Metadata } from 'next';
import { Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { SiteFooter } from './site-chrome.tsx';
import './tokens.css';
import './globals.css';

const sans = Instrument_Sans({ subsets: ['latin'], axes: ['wdth'], variable: '--font-instrument' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

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
