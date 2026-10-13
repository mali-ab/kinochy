import type { MetadataRoute } from 'next';
import { siteUrl } from '@/src/api/config';
import { getMovies } from '@/src/api/endpoints';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/subscription`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${siteUrl}/login`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/signup`, changeFrequency: 'yearly', priority: 0.3 }
  ];
  try {
    const movies = await getMovies('', { revalidate: 3600 });
    return [
      ...staticRoutes,
      ...movies.map((movie): MetadataRoute.Sitemap[number] => ({
        url: `${siteUrl}/movies/${movie.slug}`,
        lastModified: movie.updatedAt ? new Date(movie.updatedAt) : undefined,
        changeFrequency: 'weekly',
        priority: 0.8
      }))
    ];
  } catch {
    return staticRoutes;
  }
}
