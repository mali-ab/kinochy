export const initialMovieForm = {
  title: '',
  originalTitle: '',
  description: '',
  year: '2026',
  countries: ['United States'],
  genres: ['Drama'],
  type: 'Movie',
  durationHours: '1',
  durationMinutes: '30',
  rating: '8.0',
  difficulty: 'medium',
  accent: 'american',
  ageRating: '16+'
};

export const initialUserForm = {
  username: '',
  email: '',
  password: '',
  role: 'user',
  subscriptionPlan: 'free',
  subscriptionExpiresAt: ''
};

export const movieQualityOptions = ['144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p'];

export function cloneMovieForm(source = initialMovieForm) {
  return {
    ...source,
    countries: [...(source.countries || ['United States'])],
    genres: [...(source.genres || ['Drama'])]
  };
}

export function cloneUserForm(source = initialUserForm) {
  return { ...source };
}

export function movieToForm(movie) {
  const duration = parseDurationMinutes(movie.duration);
  return {
    title: movie.title || '',
    originalTitle: movie.originalTitle || movie.title || '',
    description: movie.description || '',
    year: String(movie.year || new Date().getFullYear()),
    countries: parseCountries(movie.country),
    genres: movie.genres?.length ? movie.genres : ['Drama'],
    type: movie.type === 'Animation' ? 'Cartoon' : movie.type || 'Movie',
    durationHours: String(Math.floor(duration / 60)),
    durationMinutes: String(duration % 60),
    rating: String(movie.rating || '8.0'),
    difficulty: movie.difficulty || 'medium',
    accent: movie.accent || 'american',
    ageRating: movie.ageRating || '16+'
  };
}

export function parseCountries(value) {
  if (Array.isArray(value)) return value.length ? value.map((country) => country === 'USA' ? 'United States' : country) : ['United States'];
  const text = String(value || '').trim();
  if (!text) return ['United States'];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return text.split(',').map((country) => country.trim() === 'USA' ? 'United States' : country.trim()).filter(Boolean);
}

export function getPerFileProgress(totalProgress, files) {
  const entries = Object.entries(files).filter(([, file]) => file);
  if (!entries.length) return {};
  const sizeOf = (file) => Array.isArray(file) ? file.reduce((sum, item) => sum + item.size, 0) : file.size || 0;
  const totalSize = entries.reduce((sum, [, file]) => sum + sizeOf(file), 0) || entries.length;
  let consumed = (Number(totalProgress) / 100) * totalSize;
  return Object.fromEntries(entries.map(([key, file]) => {
    const size = sizeOf(file) || 1;
    const value = Math.max(0, Math.min(100, Math.round((consumed / size) * 100)));
    consumed -= size;
    return [key, value];
  }));
}

export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function addQualityUpload(setQualityUploads, currentUploads) {
  const preferredOrder = ['720p', '1080p', '480p', '360p', '2160p', '1440p', '240p', '144p'];
  const quality = preferredOrder.find((option) => !currentUploads.some((item) => item.quality === option));
  if (!quality) return;
  setQualityUploads((value) => [...value, { id: `${Date.now()}-${quality}`, quality, file: null }]);
}

export function parseDurationMinutes(value) {
  const text = String(value || '');
  if (/^\d+$/.test(text)) return Number(text);
  const hour = Number(text.match(/(\d+)\s*h/)?.[1] || 0);
  const minute = Number(text.match(/(\d+)\s*m/)?.[1] || 0);
  return hour * 60 + minute || 90;
}

export function formatDuration(value, locale) {
  const minutes = parseDurationMinutes(value);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  if (locale === 'ru') return `${hour} ч ${minute} мин`;
  if (locale === 'tm') return `${hour} sag ${minute} min`;
  return `${hour} h ${minute} min`;
}

export function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
