// The admin app is always served same-origin with the API: /api and /media
// live at the origin root (nginx in production, the Vite proxy in dev), so
// runtime request paths are used as-is. The Vite base only affects bundled
// assets like scripts and styles.
export function withBasePath(path) {
  return path;
}
