import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kinochy',
  description: 'Learn English through movies with interactive subtitles.',
  icons: { icon: '/kinochy_favicon.png' }
};

export const viewport: Viewport = { colorScheme: 'dark', themeColor: '#171919' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
