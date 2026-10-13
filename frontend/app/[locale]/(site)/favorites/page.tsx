import type { Metadata } from 'next';
import FavoritesView from '@/src/views/FavoritesView';

export const metadata: Metadata = { title: 'Favorites · Kinochy' };

export default function FavoritesRoute() {
  return <FavoritesView />;
}
