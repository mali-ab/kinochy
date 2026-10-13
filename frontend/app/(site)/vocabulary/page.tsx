import type { Metadata } from 'next';
import VocabularyView from '@/src/views/VocabularyView';

export const metadata: Metadata = { title: 'Vocabulary · Kinochy' };

export default function VocabularyRoute() {
  return <VocabularyView />;
}
