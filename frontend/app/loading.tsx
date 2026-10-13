import { Skeleton } from '@/src/ui/skeleton.jsx';

export default function Loading() {
  return (
    <main className="route-loading" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="route-loading-mark" />
      <Skeleton className="skeleton-text" style={{ width: '220px' }} />
      <Skeleton className="skeleton-meta" style={{ width: '140px' }} />
    </main>
  );
}
