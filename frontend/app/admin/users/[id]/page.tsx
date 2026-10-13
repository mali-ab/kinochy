import AdminUserDetail from '@/src/admin/AdminUserDetail';

export default async function AdminUserEditRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminUserDetail mode="edit" id={id} />;
}
