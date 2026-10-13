import type { Metadata } from 'next';
import SubscriptionView from '@/src/views/SubscriptionView';

export const metadata: Metadata = { title: 'Subscription · Kinochy' };

export default function SubscriptionRoute() {
  return <SubscriptionView />;
}
