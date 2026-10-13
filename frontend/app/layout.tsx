import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { siteUrl } from '@/src/api/config';
import QueryProvider from '@/src/providers/QueryProvider';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Kinochy',
  description: 'Learn English through movies with interactive subtitles.',
  icons: { icon: '/kinochy_favicon.png' }
};

export const viewport: Viewport = { colorScheme: 'dark', themeColor: '#0F172A' };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The middleware resolves the URL locale; routes outside it (admin) fall back to en.
  const locale = (await headers()).get('x-next-intl-locale') ?? 'en';
  return <html lang={locale}><body><QueryProvider>{children}</QueryProvider></body></html>;
}
