'use client';

export default function DifficultyIndicator({ level = 'medium', label, showLabel = false, className = '' }) {
  const normalized = level === 'easy' || level === 'hard' ? level : 'medium';
  const count = normalized === 'easy' ? 1 : normalized === 'hard' ? 3 : 2;
  return (
    <span className={`difficulty-indicator ${normalized} ${className}`.trim()} title={label} aria-label={label}>
      <span className="difficulty-bars" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => <i key={index} />)}
      </span>
      {showLabel ? <span>{label}</span> : null}
    </span>
  );
}
