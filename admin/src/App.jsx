import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import AdminMovieDetail from './admin/AdminMovieDetail.jsx';
import AdminMovieEditor from './admin/AdminMovieEditor.jsx';
import AdminMoviesList from './admin/AdminMoviesList.jsx';
import AdminComments from './admin/AdminComments.jsx';
import AdminShell from './admin/AdminShell.jsx';
import AdminUserDetail from './admin/AdminUserDetail.jsx';
import AdminUsersList from './admin/AdminUsersList.jsx';

// The standalone admin application owns its origin, so routes start at /.
// Vite injects the build base (APP_BASE_PATH, e.g. /admin/) as BASE_URL.
// Use it as the router basename so the SPA works when nginx mounts it under
// /admin/ alongside the public site; "/" strips to "" (root mount, no-op).
const basename = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route
          path="/"
          element={
            <AdminShell>
              <Outlet />
            </AdminShell>
          }
        >
          <Route index element={<Navigate to="films" replace />} />
          <Route path="films" element={<AdminMoviesList type="Movie" />} />
          <Route path="series" element={<AdminMoviesList type="Series" />} />
          <Route path="cartoons" element={<AdminMoviesList type="Cartoon" />} />
          <Route path="movies/new" element={<AdminMovieEditor />} />
          <Route path="movies/:id" element={<MovieDetailRoute />} />
          <Route path="movies/:id/edit" element={<MovieEditorRoute />} />
          <Route path="users" element={<AdminUsersList />} />
          <Route path="users/new" element={<AdminUserDetail mode="add" />} />
          <Route path="users/:id" element={<UserDetailRoute />} />
          <Route path="comments" element={<AdminComments />} />
          <Route path="*" element={<Navigate to="/films" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
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
