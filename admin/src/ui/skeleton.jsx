/** @param {{ className?: string, style?: any }} props */
export function Skeleton({ className = '', style }) {
  return <span className={`skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}

export function AdminRowsSkeleton({ rows = 6 }) {
  return (
    <div className="admin-skeleton-rows" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div className="admin-skeleton-row" key={index} aria-hidden="true">
          <Skeleton className="skeleton-thumb" />
          <div className="skeleton-stack">
            <Skeleton className="skeleton-text" style={{ width: '32%' }} />
            <Skeleton className="skeleton-meta" style={{ width: '54%' }} />
          </div>
          <Skeleton className="skeleton-badge" />
        </div>
      ))}
    </div>
  );
}

export function AdminDetailSkeleton() {
  return (
    <div className="movie-detail" role="status" aria-busy="true" aria-label="Loading movie">
      <Skeleton className="skeleton-poster skeleton-detail-poster" />
      <div className="skeleton-detail-copy">
        <Skeleton className="skeleton-kicker" />
        <Skeleton className="skeleton-heading" style={{ width: '70%' }} />
        <Skeleton className="skeleton-text" style={{ width: '88%' }} />
        <Skeleton className="skeleton-text" style={{ width: '64%' }} />
        <Skeleton className="skeleton-button" />
      </div>
    </div>
  );
}
