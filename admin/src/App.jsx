import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import AdminMovieDetail from './admin/AdminMovieDetail.jsx';
import AdminMovieEditor from './admin/AdminMovieEditor.jsx';
import AdminMoviesList from './admin/AdminMoviesList.jsx';
import AdminShell from './admin/AdminShell.jsx';
import AdminUserDetail from './admin/AdminUserDetail.jsx';
import AdminUsersList from './admin/AdminUsersList.jsx';

// The routes mirror the former Next.js app/admin tree one to one, so the
// /admin/... URLs stay the same in development and production.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin"
          element={
            <AdminShell>
              <Outlet />
            </AdminShell>
          }
        >
          <Route index element={<AdminMoviesList />} />
          <Route path="movies/new" element={<AdminMovieEditor />} />
          <Route path="movies/:id" element={<MovieDetailRoute />} />
          <Route path="movies/:id/edit" element={<MovieEditorRoute />} />
          <Route path="users" element={<AdminUsersList />} />
          <Route path="users/new" element={<AdminUserDetail mode="add" />} />
          <Route path="users/:id" element={<UserDetailRoute />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function MovieDetailRoute() {
  const { id } = useParams();
  return <AdminMovieDetail id={id} />;
}

function MovieEditorRoute() {
  const { id } = useParams();
  return <AdminMovieEditor id={id} />;
}

function UserDetailRoute() {
  const { id } = useParams();
  return <AdminUserDetail mode="edit" id={id} />;
}
