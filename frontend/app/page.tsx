'use client';

import dynamic from 'next/dynamic';

const ClientApplication = dynamic(() => import('@/src/ClientApplication'), {
  ssr: false,
  loading: () => <main className="grid min-h-screen place-items-center bg-kinochy-canvas text-white">Loading…</main>
});

export default function HomePage() {
  return <ClientApplication />;
}
