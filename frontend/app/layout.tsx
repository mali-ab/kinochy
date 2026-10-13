import type { Metadata, Viewport } from 'next';
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><QueryProvider>{children}</QueryProvider></body></html>;
}
