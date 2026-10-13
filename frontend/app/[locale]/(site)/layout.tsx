import { notFound } from 'next/navigation';
import { isLocale } from '@/src/catalog/urls';
import SiteShell from '@/src/ui/SiteShell';

export default async function SiteLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <SiteShell locale={locale}>{children}</SiteShell>;
}
