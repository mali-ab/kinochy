import type { MetadataRoute } from 'next';
import { siteUrl } from '@/src/api/config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/media'] }],
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
