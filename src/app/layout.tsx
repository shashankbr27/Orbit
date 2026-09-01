import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Serif, Caveat } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const hand = Caveat({
  subsets: ['latin'],
  variable: '--font-hand',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ORBIT — your universe',
  description:
    'A place to keep the people, photographs, songs and moments that made you — arranged as a universe you can fly through.',
  applicationName: 'ORBIT',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'ORBIT',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: {
    title: 'ORBIT — your universe',
    description:
      'Everything has a place in your universe. Pan, zoom, and place your memories among the stars.',
    type: 'website',
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // The canvas handles its own zoom; browser zoom would fight the gestures.
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#04050a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${hand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
