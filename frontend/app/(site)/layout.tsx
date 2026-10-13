import SiteShell from '@/src/ui/SiteShell';

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SiteShell>{children}</SiteShell>;
}
