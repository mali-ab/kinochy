'use client';

/** @param {{ className?: string, style?: any }} props */
export function Skeleton({ className = '', style }) {
  return <span className={`skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}

export function CatalogFeatureSkeleton() {
  return (
    <div className="skeleton-feature" role="status" aria-busy="true" aria-label="Loading">
      <div className="skeleton-feature-copy">
        <Skeleton className="skeleton-kicker" />
        <Skeleton className="skeleton-heading" />
        <Skeleton className="skeleton-text" style={{ width: '68%' }} />
        <Skeleton className="skeleton-text" style={{ width: '46%' }} />
        <Skeleton className="skeleton-button" />
      </div>
    </div>
  );
}

export function MovieCardSkeleton() {
  return (
    <div className="movie-card-skeleton" aria-hidden="true">
      <Skeleton className="skeleton-poster" />
      <div className="movie-card-copy">
        <Skeleton className="skeleton-title" />
        <Skeleton className="skeleton-meta" style={{ width: '62%' }} />
      </div>
    </div>
  );
}

export function MovieGridSkeleton({ count = 12 }) {
  return (
    <div className="movie-grid" role="status" aria-busy="true" aria-label="Loading movies">
      {Array.from({ length: count }, (_, index) => (
        <MovieCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function MovieDetailSkeleton() {
  return (
    <div className="movie-detail" role="status" aria-busy="true" aria-label="Loading movie">
      <Skeleton className="skeleton-poster skeleton-detail-poster" />
      <div className="skeleton-detail-copy">
        <Skeleton className="skeleton-kicker" />
        <Skeleton className="skeleton-heading" style={{ width: '82%' }} />
        <Skeleton className="skeleton-text" style={{ width: '40%' }} />
        <Skeleton className="skeleton-button" style={{ width: '180px' }} />
        <div className="skeleton-facts">
          {Array.from({ length: 7 }, (_, index) => (
            <div className="skeleton-fact" key={index}>
              <Skeleton className="skeleton-text" style={{ width: '92px' }} />
              <Skeleton className="skeleton-text" style={{ width: '55%' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function VocabularySkeleton({ rows = 6 }) {
  return (
    <div className="vocabulary-grid" role="status" aria-busy="true" aria-label="Loading vocabulary">
      {[0, 1].map((column) => (
        <div className="vocabulary-column" key={column}>
          {Array.from({ length: rows }, (_, index) => (
            <div className="vocabulary-item" key={index} aria-hidden="true">
              <Skeleton className="skeleton-badge" />
              <div className="skeleton-stack">
                <Skeleton className="skeleton-title" style={{ width: '38%' }} />
                <Skeleton className="skeleton-text" style={{ width: '66%' }} />
              </div>
              <Skeleton className="skeleton-badge" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
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

export function CatalogPageSkeleton() {
  return (
    <section className="catalog-page" role="status" aria-busy="true" aria-label="Loading catalog">
      <CatalogFeatureSkeleton />
      <MovieGridSkeleton count={12} />
    </section>
  );
}
