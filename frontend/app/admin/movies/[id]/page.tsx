import AdminMovieDetail from '@/src/admin/AdminMovieDetail';

export default async function AdminMovieDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminMovieDetail id={id} />;
}
