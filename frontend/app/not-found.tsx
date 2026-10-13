import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="status" style={{ display: 'grid', gap: 12, minHeight: '60vh', alignContent: 'center' }}>
      <h1 style={{ margin: 0, color: '#fff' }}>404 — Page not found</h1>
      <p style={{ margin: 0 }}>The page you are looking for does not exist or has been moved.</p>
      <Link href="/" style={{ color: '#ff7a59' }}>
        Back to Kinochy
      </Link>
    </main>
  );
}
