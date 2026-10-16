import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Bebas_Neue } from 'next/font/google';
import { siteUrl } from '@/src/api/config';
import QueryProvider from '@/src/providers/QueryProvider';
import './globals.css';

// Poster-condensed display face for the auth ticket's marquee lettering.
// Exposed as --font-display so it applies only where opted in.
const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap'
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Kinochy',
  description: 'Learn English through movies with interactive subtitles.',
  icons: { icon: '/kinochy_favicon.png' }
};

export const viewport: Viewport = { colorScheme: 'dark', themeColor: '#0F172A' };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The middleware resolves the URL locale for the html lang attribute.
  const locale = (await headers()).get('x-next-intl-locale') ?? 'en';
  return (
    <html lang={locale} className={bebasNeue.variable}>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
