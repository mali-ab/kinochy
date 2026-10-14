import { notFound } from 'next/navigation';
import { getMessages } from 'next-intl/server';
import { isLocale } from '@/src/catalog/urls';
import SiteShell from '@/src/ui/SiteShell';

export default async function SiteLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // Only the active locale's messages are loaded and passed to the client
  // provider, so the browser bundle no longer ships every language.
  const messages = await getMessages();
  return <SiteShell locale={locale} messages={messages}>{children}</SiteShell>;
}
