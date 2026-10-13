import AdminMovieEditor from '@/src/admin/AdminMovieEditor';

export default async function AdminMovieEditRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminMovieEditor id={id} />;
}
