import { ArrowLeft, Edit3, Film, Image, Lock, LogOut, Plus, Save, Trash2, Upload, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, apiUpload, moviePosterFallback } from '../api';
import { withBasePath } from '../paths';
import MoviePlayer from '../player/MoviePlayer.jsx';
import { normalizeSubtitleCues } from '../player/subtitleCues.js';
import { translateGenre, useLocale } from '../ui/locale.jsx';

const initialMovieForm = {
  title: '',
  originalTitle: '',
  description: '',
  year: '2026',
  countries: ['USA'],
  genres: ['Drama'],
  type: 'Movie',
  durationHours: '1',
  durationMinutes: '30',
  rating: '8.0',
  difficulty: 'medium',
  accent: 'american',
  ageRating: '16+'
};

const countryOptions = [
  'USA',
  'United Kingdom',
  'Canada',
  'Australia',
  'New Zealand',
  'Ireland',
  'France',
  'Germany',
  'Italy',
  'Spain',
  'Russia',
  'Turkmenistan',
  'Turkey',
  'India',
  'Japan',
  'South Korea',
  'China',
  'Mexico',
  'Brazil',
  'Argentina',
  'South Africa'
];

const initialUserForm = {
  username: '',
  email: '',
  password: '',
  role: 'user',
  subscriptionPlan: 'free',
  subscriptionExpiresAt: ''
};

function cloneMovieForm(source = initialMovieForm) {
  return {
    ...source,
    countries: [...(source.countries || ['USA'])],
    genres: [...(source.genres || ['Drama'])]
  };
}

function cloneUserForm(source = initialUserForm) {
  return { ...source };
}

export default function AdminPage() {
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(true);
  const localeTools = useLocale();

  useEffect(() => {
    api('/api/auth/me')
      .then((data) => setAdmin(data.admin))
      .catch(() => setAdmin(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="status">{localeTools.t('admin_checking')}</div>;
  if (!admin) return <LoginForm onLogin={setAdmin} />;
  return <AdminDashboard admin={admin} onLogout={() => setAdmin(null)} />;
}

function LoginForm({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { t } = useLocale();

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      onLogin(data.admin);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="admin-page">
      <form className="login-panel" onSubmit={submit}>
        <Lock size={30} />
        <h1>{t('admin_title')}</h1>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder={t('admin_email_hint')} autoComplete="username" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('admin_password_hint')} type="password" autoComplete="current-password" />
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary">{t('login')}</button>
        <Link className="admin-back-link" to="/"><ArrowLeft size={16} /> {t('nav_back_to_site')}</Link>
      </form>
    </section>
  );
}

function AdminDashboard({ admin, onLogout }) {
  const { t } = useLocale();
  const [confirm, setConfirm] = useState(null);

  function requestConfirm({ title, body, actionLabel = 'Confirm', danger = false, onConfirm }) {
    setConfirm({ title, body, actionLabel, danger, onConfirm });
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    onLogout();
  }

  async function confirmAction() {
    const action = confirm?.onConfirm;
    setConfirm(null);
    await action?.();
  }

  return (
    <section className="admin-page">
      <div className="admin-head">
        <Link to="/admin" className="admin-brand">
          <span className="brand-mark">
            <img src={withBasePath('/kinochy_favicon.png')} alt="" width="32" height="32" />
          </span>
          <span>
            <small>{t('admin_signed_in_as')} {admin.email}</small>
            <strong>Kinochy Admin</strong>
          </span>
        </Link>
        <div className="admin-head-actions">
          <Link className="admin-back-link" to="/"><ArrowLeft size={17} /> {t('nav_back_to_site')}</Link>
          <button
            onClick={() =>
              requestConfirm({
                title: 'Log out?',
                body: 'This will close your admin session.',
                actionLabel: t('admin_logout'),
                onConfirm: logout
              })
            }
          >
            <LogOut size={18} /> {t('admin_logout')}
          </button>
        </div>
      </div>

      <div className="admin-tabs">
        <Link to="/admin">
          <Film size={18} /> Movies
        </Link>
        <Link to="/admin/users">
          <Users size={18} /> Users
        </Link>
      </div>

      <Routes>
        <Route index element={<AdminMoviesList />} />
        <Route path="movies/new" element={<AdminMovieEditor />} />
        <Route path="movies/:id" element={<AdminMovieDetail requestConfirm={requestConfirm} />} />
        <Route path="movies/:id/edit" element={<AdminMovieEditor />} />
        <Route path="users" element={<AdminUsersList requestConfirm={requestConfirm} />} />
        <Route path="users/new" element={<AdminUserDetail mode="add" />} />
        <Route path="users/:id" element={<AdminUserDetail mode="edit" />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>

      {confirm ? (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="confirm-panel" onClick={(event) => event.stopPropagation()}>
            <h2>{confirm.title}</h2>
            <p>{confirm.body}</p>
            <div>
              <button onClick={() => setConfirm(null)}>Cancel</button>
              <button className={confirm.danger ? 'danger' : ''} onClick={confirmAction}>
                {confirm.actionLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AdminMoviesList() {
  const [movies, setMovies] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('/api/movies?search=').then((data) => setMovies(Array.isArray(data) ? data : []));
  }, []);

  return (
    <>
      <div className="admin-list-head">
        <h2>Movies</h2>
        <Link className="primary" to="/admin/movies/new">
          <Plus size={18} /> Add movie
        </Link>
      </div>
      {message ? <p className="form-message">{message}</p> : null}
      <div className="admin-movie-list">
        {movies.map((movie) => (
          <Link key={movie.id} className="admin-movie-row" to={`/admin/movies/${movie.id}`}>
            <span className="admin-row-cover" style={movie.coverUrl ? { backgroundImage: `url(${withBasePath(movie.coverUrl)})` } : { background: moviePosterFallback(movie) }} />
            <span>
              <strong>{movie.title}</strong>
              <small>{movie.type} / {movie.year} / {movie.genres?.join(', ') || movie.genre}</small>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

function AdminMovieDetail({ requestConfirm }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [subtitles, setSubtitles] = useState({ en: [], ru: [] });
  const [loading, setLoading] = useState(true);
  const { locale } = useLocale();

  useEffect(() => {
    let active = true;
    setLoading(true);
    api(`/api/admin/movies/${id}`)
      .then(async (movieData) => {
        const [en, ru] = await Promise.all([
          api(`/api/movies/${movieData.slug}/subtitles/en`).catch(() => []),
          api(`/api/movies/${movieData.slug}/subtitles/ru`).catch(() => [])
        ]);
        if (!active) return;
        setMovie(movieData);
        setSubtitles({ en: normalizeSubtitleCues(en), ru: normalizeSubtitleCues(ru) });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  async function deleteMovie() {
    await api(`/api/admin/movies/${id}`, { method: 'DELETE', body: JSON.stringify({}) });
    navigate('/admin');
  }

  if (loading) return <div className="status">Loading movie...</div>;
  if (!movie) return <div className="status">Movie not found.</div>;

  return (
    <div className="admin-detail">
      <div className="admin-detail-head">
        <button onClick={() => navigate('/admin')}>Back</button>
        <div className="admin-actions">
          <Link to={`/admin/movies/${movie.id}/edit`}>
            <Edit3 size={16} /> Edit
          </Link>
          <button
            className="danger"
            onClick={() =>
              requestConfirm({
                title: 'Delete movie?',
                body: `Delete "${movie.title}" and its uploaded files? This cannot be undone.`,
                actionLabel: 'Delete',
                danger: true,
                onConfirm: deleteMovie
              })
            }
          >
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>
      <div className="admin-movie-detail">
        <div className="admin-movie-cover" style={movie.coverUrl ? { backgroundImage: `url(${withBasePath(movie.coverUrl)})` } : { background: moviePosterFallback(movie) }} />
        <div>
          <h2>{movie.title}</h2>
          <p>{movie.description}</p>
          <dl className="admin-facts">
            <dt>Type</dt><dd>{movie.type}</dd>
            <dt>Year</dt><dd>{movie.year}</dd>
            <dt>Genres</dt><dd>{movie.genres?.map((genre) => translateGenre(locale, genre)).join(', ') || movie.genre}</dd>
            <dt>Duration</dt><dd>{formatDuration(movie.duration, locale)}</dd>
            <dt>Rating</dt><dd>{movie.rating}</dd>
          </dl>
        </div>
      </div>
      <MoviePlayer movie={movie} subtitles={subtitles} access={{ hasFullAccess: true }} />
      {movie.type === 'Series' ? <AdminSeriesEpisodes movie={movie} /> : null}
    </div>
  );
}

function AdminSeriesEpisodes({ movie }) {
  const [seasons, setSeasons] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [form, setForm] = useState({ movieId: '', seasonNumber: '1', episodeNumber: '1', title: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/movies/${movie.slug}/seasons`).then((data) => setSeasons(Array.isArray(data) ? data : [])).catch(() => setSeasons([]));
    api('/api/movies?search=').then((data) => setCatalog(Array.isArray(data) ? data.filter((item) => item.id !== movie.id) : [])).catch(() => setCatalog([]));
  }, [movie.id, movie.slug]);

  async function addEpisode(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api(`/api/admin/series/${movie.id}/episodes`, {
        method: 'POST',
        body: JSON.stringify({ movieId: form.movieId, seasonNumber: Number(form.seasonNumber), episodeNumber: Number(form.episodeNumber), title: form.title || null })
      });
      setSeasons(data);
      setForm((current) => ({ ...current, movieId: '', episodeNumber: String(Number(current.episodeNumber) + 1), title: '' }));
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeEpisode(id) {
    setError('');
    try {
      await api(`/api/admin/series/${movie.id}/episodes/${id}`, { method: 'DELETE' });
      const data = await api(`/api/movies/${movie.slug}/seasons`);
      setSeasons(data);
    } catch (issue) {
      setError(issue.message);
    }
  }

  return <section className="admin-series-panel">
    <h3>Seasons & episodes</h3>
    <p>Add each playable episode as a movie first, then link it to this series.</p>
    <form onSubmit={addEpisode}>
      <label>Season<input type="number" min="1" max="100" required value={form.seasonNumber} onChange={(event) => setForm((current) => ({ ...current, seasonNumber: event.target.value }))} /></label>
      <label>Episode<input type="number" min="1" max="1000" required value={form.episodeNumber} onChange={(event) => setForm((current) => ({ ...current, episodeNumber: event.target.value }))} /></label>
      <label>Movie<select required value={form.movieId} onChange={(event) => setForm((current) => ({ ...current, movieId: event.target.value }))}><option value="">Choose a movie</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Episode title (optional)<input maxLength="200" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
      <button className="primary" disabled={busy || !form.movieId}><Plus size={16} /> Add episode</button>
    </form>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {seasons.map((season) => <div className="admin-season" key={season.number}><h4>Season {season.number}</h4>{season.episodes.map((episode) => <div key={episode.id}><span>{episode.episodeNumber}. {episode.title}</span><button type="button" onClick={() => removeEpisode(episode.id)} aria-label={`Remove ${episode.title}`}><Trash2 size={15} /> Remove</button></div>)}</div>)}
  </section>;
}

function AdminMovieEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [genres, setGenres] = useState(['Drama']);
  const [loading, setLoading] = useState(Boolean(id));

  useEffect(() => {
    api('/api/genres').then((data) => setGenres(Array.isArray(data) && data.length ? data : ['Drama'])).catch(() => setGenres(['Drama']));
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api(`/api/admin/movies/${id}`)
      .then(setMovie)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="status">Loading editor...</div>;
  return (
    <MovieEditor
      movie={movie}
      genres={genres}
      onCancel={() => navigate(movie ? `/admin/movies/${movie.id}` : '/admin')}
      onSaved={(saved) => navigate(`/admin/movies/${saved.id}`)}
    />
  );
}

function MovieEditor({ movie, genres, onCancel, onSaved }) {
  const [form, setForm] = useState(() => cloneMovieForm(movie ? movieToForm(movie) : initialMovieForm));
  const [sourceType, setSourceType] = useState(movie?.streaming?.hls ? 'hls' : 'video');
  const [files, setFiles] = useState({});
  const [hlsFiles, setHlsFiles] = useState([]);
  const [coverPreview, setCoverPreview] = useState(movie?.coverUrl ? withBasePath(movie.coverUrl) : '');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState('');
  const { locale, t } = useLocale();

  useEffect(() => {
    if (!files.cover) {
      setCoverPreview(movie?.coverUrl ? withBasePath(movie.coverUrl) : '');
      return undefined;
    }

    const url = URL.createObjectURL(files.cover);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [files.cover, movie?.coverUrl]);

  function updateField(event) {
    setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  }

  function updateCountries(event) {
    const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
    setForm((value) => ({ ...value, countries: selected.length ? selected : ['USA'] }));
  }

  function toggleGenre(genre) {
    setForm((value) => {
      const selected = value.genres.includes(genre) ? value.genres.filter((item) => item !== genre) : [...value.genres, genre];
      return { ...value, genres: selected.length ? selected : ['Drama'] };
    });
  }

  function updateFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setFiles((value) => ({ ...value, [event.target.name]: file }));
    if (event.target.name === 'video' && file.name.toLowerCase().endsWith('.zip')) setHlsFiles([]);
    if (event.target.name === 'subtitleZip') setFiles((value) => ({ ...value, subtitleZip: file, subtitleEn: null, subtitleRu: null }));
    if (event.target.name === 'subtitleEn' || event.target.name === 'subtitleRu') setFiles((value) => ({ ...value, [event.target.name]: file, subtitleZip: null }));
    setProgress((value) => ({ ...value, [event.target.name]: 0 }));
  }

  function removeFile(key) {
    setFiles((value) => ({ ...value, [key]: null }));
    setProgress((value) => ({ ...value, [key]: 0 }));
  }

  function changeSource(type) {
    setSourceType(type);
    setFiles((value) => ({ ...value, video: null }));
    setHlsFiles([]);
    setProgress({});
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setProgress({});
    const missingFiles = [];
    if (!files.video && (!currentStatus.video || Boolean(movie?.streaming?.hls) !== (sourceType === 'hls'))) missingFiles.push(sourceType === 'hls' ? 'HLS ZIP or M3U8 playlist' : t('admin_movie_file'));
    if (sourceType === 'hls' && files.video && !files.video.name.toLowerCase().endsWith('.zip') && hlsFiles.length === 0) missingFiles.push('HLS segment files');
    if (missingFiles.length) {
      setBusy(false);
      setError(`Please choose: ${missingFiles.join(', ')}`);
      return;
    }
    const body = new FormData();
    const duration = String(Number(form.durationHours || 0) * 60 + Number(form.durationMinutes || 0));
    Object.entries({ ...form, country: JSON.stringify(form.countries), duration }).forEach(([key, value]) => {
      if (key === 'durationHours' || key === 'durationMinutes') return;
      if (key === 'countries') return;
      body.append(key, key === 'genres' ? JSON.stringify(value) : value);
    });
    Object.entries(files).forEach(([key, file]) => file && body.append(key, file));
    if (sourceType === 'hls' && !files.video?.name.toLowerCase().endsWith('.zip')) hlsFiles.forEach((file) => body.append('hlsFiles', file));

    try {
      const saved = await apiUpload(movie ? `/api/admin/movies/${movie.id}` : '/api/admin/movies', {
        method: movie ? 'PATCH' : 'POST',
        body,
        onProgress: (value) => setProgress(getPerFileProgress(value, { ...files, hlsFiles }))
      });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const currentFiles = movie?.fileNames || {};
  const currentStatus = movie?.fileStatus || {};
  const currentSourceMatches = Boolean(movie?.streaming?.hls) === (sourceType === 'hls');
  const hlsSize = hlsFiles.reduce((total, file) => total + file.size, 0);

  return (
    <form className="admin-form" onSubmit={submit}>
      <div className="admin-list-head admin-editor-heading">
        <div><span className="admin-editor-eyebrow">Kinochy studio / Movie library</span><h2>{movie ? 'Edit movie' : 'Add a movie'}</h2><p>Set up the details, choose a playback source, then publish.</p></div>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      <div className="admin-editor-section-head"><span className="admin-editor-step">01</span><div><h3>Movie details</h3><p>Help viewers find the right film and language level.</p></div></div>
      <div className="form-grid">
        <label>{t('admin_title_label')}<input name="title" required value={form.title} onChange={updateField} /></label>
        <label>{t('admin_original_title')}<input name="originalTitle" value={form.originalTitle} onChange={updateField} /></label>
        <label>{t('admin_year')}<input name="year" value={form.year} onChange={updateField} /></label>
        <label>{t('admin_country')}<select className="multi-select" multiple value={form.countries} onChange={updateCountries}>{countryOptions.map((country) => <option key={country} value={country}>{country}</option>)}</select></label>
        <label className="wide">{t('admin_genres')}<div className="genre-chips">{genres.map((genre) => <button type="button" key={genre} className={form.genres.includes(genre) ? 'active' : ''} onClick={() => toggleGenre(genre)}>{translateGenre(locale, genre)}</button>)}</div></label>
        <label>{t('admin_type')}<select name="type" value={form.type} onChange={updateField}><option value="Movie">{t('movie_type_movie')}</option><option value="Series">{t('movie_type_series')}</option><option value="Animation">{t('movie_type_animation')}</option></select></label>
        <label>{t('admin_duration')}<div className="duration-picker"><select name="durationHours" value={form.durationHours} onChange={updateField}>{range(0, 6).map((hour) => <option key={hour} value={hour}>{hour} h</option>)}</select><select name="durationMinutes" value={form.durationMinutes} onChange={updateField}>{range(0, 59).map((minute) => <option key={minute} value={minute}>{minute} min</option>)}</select></div></label>
        <label>{t('admin_rating')}<input name="rating" value={form.rating} onChange={updateField} /></label>
        <label className="wide">{t('admin_description')}<textarea name="description" rows="5" value={form.description} onChange={updateField} /></label>
      </div>

      <div className="admin-editor-section-head"><span className="admin-editor-step">02</span><div><h3>Movie bundle</h3><p>Choose a ready video or upload one ZIP containing the complete adaptive HLS folder tree.</p></div></div>
      <div className="source-switch" role="group" aria-label="Playback source">
        <button type="button" className={sourceType === 'video' ? 'active' : ''} onClick={() => changeSource('video')} aria-pressed={sourceType === 'video'}><Film size={18} /><span><strong>Video file</strong><small>MP4, WebM or MKV</small></span></button>
        <button type="button" className={sourceType === 'hls' ? 'active' : ''} onClick={() => changeSource('hls')} aria-pressed={sourceType === 'hls'}><Upload size={18} /><span><strong>HLS bundle</strong><small>ZIP or M3U8 + segments</small></span></button>
      </div>
      {sourceType === 'hls' ? <p className="source-note bundle-note"><strong>Recommended ZIP structure:</strong> master.m3u8 at the root, with v0, v1 and v2 rendition folders. A single containing folder is also accepted. Keep subtitles in their own ZIP below.</p> : <p className="source-note">MP4 with browser-compatible codecs is recommended. The server streams the file as uploaded; it does not transcode it.</p>}
      <div className="upload-grid">
        <FileBox icon={<Film />} name="video" label={sourceType === 'hls' ? 'HLS ZIP or main M3U8' : t('admin_movie_file')} accept={sourceType === 'hls' ? '.zip,.m3u8,application/zip,application/vnd.apple.mpegurl' : 'video/mp4,video/webm,video/x-matroska,.mp4,.webm,.mkv'} required={!currentStatus.video || !currentSourceMatches} file={files.video} current={currentSourceMatches ? currentFiles.video : null} progress={progress.video} onChange={updateFile} onRemove={() => removeFile('video')} />
        {sourceType === 'hls' && !files.video?.name.toLowerCase().endsWith('.zip') ? <div className="hls-file-box"><label htmlFor="hls-files"><Upload size={22} /><span><strong>HLS media files</strong><small>{hlsFiles.length ? `${hlsFiles.length} files · ${formatFileSize(hlsSize)}` : 'Choose all segments and companion playlists'}</small></span></label><input id="hls-files" type="file" multiple accept=".ts,.m4s,.mp4,.aac,.mp3,.vtt,.key,.m3u8" onChange={(event) => { setHlsFiles(Array.from(event.target.files)); event.target.value = ''; }} />{hlsFiles.length ? <div className="hls-file-summary"><span>{hlsFiles.slice(0, 3).map((file) => file.name).join(' · ')}{hlsFiles.length > 3 ? ` · +${hlsFiles.length - 3} more` : ''}</span><button type="button" onClick={() => setHlsFiles([])}>Clear</button></div> : null}{typeof progress.hlsFiles === 'number' && progress.hlsFiles > 0 ? <Progress value={progress.hlsFiles} /> : null}</div> : null}
      </div>

      <div className="admin-editor-section-head"><span className="admin-editor-step">03</span><div><h3>Artwork & subtitle bundle</h3><p>Upload one subtitle ZIP for both languages, or select the files separately.</p></div></div>
      <div className="upload-grid">
        <FileBox icon={<Image />} name="cover" label={t('admin_cover_image')} accept="image/*" file={files.cover} current={currentFiles.cover} preview={coverPreview} progress={progress.cover} onChange={updateFile} onRemove={() => removeFile('cover')} />
        <div className="subtitle-bundle-upload"><FileBox icon={<Upload />} name="subtitleZip" label="Subtitle ZIP · EN + RU" accept=".zip,application/zip" file={files.subtitleZip} progress={progress.subtitleZip} onChange={updateFile} onRemove={() => removeFile('subtitleZip')} /><p>Name files with their language: <code>movie.en.srt</code> and <code>movie.ru.srt</code>. VTT is also supported.</p></div>
        {!files.subtitleZip ? <><FileBox icon={<Upload />} name="subtitleEn" label={t('admin_subtitle_en')} accept=".srt,.vtt,text/vtt" file={files.subtitleEn} current={currentFiles.subtitleEn} progress={progress.subtitleEn} onChange={updateFile} onRemove={() => removeFile('subtitleEn')} /><FileBox icon={<Upload />} name="subtitleRu" label={t('admin_subtitle_ru')} accept=".srt,.vtt,text/vtt" file={files.subtitleRu} current={currentFiles.subtitleRu} progress={progress.subtitleRu} onChange={updateFile} onRemove={() => removeFile('subtitleRu')} /></> : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary admin-publish" disabled={busy}>
        <Save size={18} /> {busy ? t('admin_uploading') : movie ? 'Save movie' : t('admin_publish')}
      </button>
    </form>
  );
}

function AdminUsersList({ requestConfirm }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    api('/api/admin/users').then((data) => setUsers(Array.isArray(data) ? data : []));
  }, []);

  async function deleteUsers(ids) {
    await api('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ ids }) });
    setSelected([]);
    setUsers((value) => value.filter((user) => !ids.includes(user.id)));
  }

  function toggle(id) {
    setSelected((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  function toggleAll() {
    setSelected((value) => (value.length === users.length ? [] : users.map((user) => user.id)));
  }

  const allSelected = Boolean(users.length && selected.length === users.length);

  return (
    <div className="admin-users">
      <div className="admin-table-wrap">
        <div className="admin-list-head">
          <h2>Users</h2>
          <div className="admin-actions">
            <Link className="primary" to="/admin/users/new">
              <Plus size={16} /> Add user
            </Link>
            <button
              className="danger"
              disabled={!selected.length}
              onClick={() =>
                requestConfirm({
                  title: 'Delete selected users?',
                  body: `Delete ${selected.length} selected user${selected.length === 1 ? '' : 's'}?`,
                  actionLabel: 'Delete',
                  danger: true,
                  onConfirm: () => deleteUsers(selected)
                })
              }
            >
              <Trash2 size={16} /> Delete selected
            </button>
          </div>
        </div>
        <table className="admin-table">
          <thead><tr><th><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th><th>Username</th><th>Email</th><th>Role</th><th>Plan</th><th>Language</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td><input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggle(user.id)} /></td>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td><span className={`subscription-badge ${user.subscription?.hasFullAccess ? 'premium' : ''}`}>{user.subscription?.hasFullAccess ? 'Premium' : 'Free'}</span></td>
                <td>{user.language?.toUpperCase()}</td>
                <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}</td>
                <td>
                  <Link to={`/admin/users/${user.id}`}><Edit3 size={15} /></Link>
                  <button
                    className="danger"
                    onClick={() =>
                      requestConfirm({
                        title: 'Delete user?',
                        body: `Delete ${user.email}?`,
                        actionLabel: 'Delete',
                        danger: true,
                        onConfirm: () => deleteUsers([user.id])
                      })
                    }
                  ><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminUserDetail({ mode }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => cloneUserForm());
  const [loading, setLoading] = useState(mode === 'edit');
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'edit') return;
    setLoading(true);
    api(`/api/admin/users/${id}`)
      .then((user) => setForm({ username: user.username, email: user.email, password: '', role: user.role || 'user', subscriptionPlan: user.subscriptionPlan || 'free', subscriptionExpiresAt: user.subscriptionExpiresAt?.slice(0, 10) || '' }))
      .finally(() => setLoading(false));
  }, [id, mode]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await api(mode === 'edit' ? `/api/admin/users/${id}` : '/api/admin/users', {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...form, subscriptionExpiresAt: form.subscriptionExpiresAt || null })
      });
      navigate('/admin/users');
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <div className="status">Loading user...</div>;

  return (
    <form className="admin-form compact admin-user-panel" onSubmit={submit}>
      <div className="admin-list-head">
        <h2>{mode === 'edit' ? 'Edit user' : 'Add user'}</h2>
        <button type="button" onClick={() => navigate('/admin/users')}>Cancel</button>
      </div>
      <div className="form-grid">
        <label>Username<input value={form.username} onChange={(event) => setForm((value) => ({ ...value, username: event.target.value }))} required /></label>
        <label>Email<input type="email" value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} required /></label>
        <label>Password<input type="password" value={form.password} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} placeholder={mode === 'edit' ? 'Leave empty to keep current' : 'Strong password'} required={mode !== 'edit'} /></label>
        <label>Role<select value={form.role} onChange={(event) => setForm((value) => ({ ...value, role: event.target.value }))}><option value="user">User</option><option value="admin">Admin</option></select></label>
        <label>Subscription<select value={form.subscriptionPlan} onChange={(event) => setForm((value) => ({ ...value, subscriptionPlan: event.target.value }))}><option value="free">Free · 10-minute preview</option><option value="premium">Premium · Full movies</option></select></label>
        <label>Premium expires<input type="date" value={form.subscriptionExpiresAt} disabled={form.subscriptionPlan !== 'premium'} onChange={(event) => setForm((value) => ({ ...value, subscriptionExpiresAt: event.target.value }))} /><small>Leave empty for no expiry.</small></label>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary"><Save size={18} /> {mode === 'edit' ? 'Save user' : 'Add user'}</button>
    </form>
  );
}

function FileBox({ icon, label, file, current, preview, progress, onRemove, required, ...props }) {
  const text = file?.name || current || label;
  const inputId = `file-${props.name}`;
  const status = file ? (current ? 'Will replace uploaded file' : 'Selected') : current ? 'Uploaded' : required ? 'Required' : 'Optional';
  return (
    <div className="file-box has-actions">
      <label htmlFor={inputId} className="file-picker-main">
        {preview ? <span className="file-preview" style={{ backgroundImage: `url(${preview})` }} /> : icon}
        <span>{text}</span>
      </label>
      <small>{status}</small>
      {typeof progress === 'number' && progress > 0 ? <Progress value={progress} /> : null}
      {file ? <button type="button" onClick={onRemove}>Remove</button> : null}
      <input id={inputId} type="file" {...props} required={false} />
    </div>
  );
}

function Progress({ value }) {
  return (
    <div className="upload-progress" aria-live="polite">
      <div className="upload-progress-track"><div className="upload-progress-fill" style={{ width: `${value}%` }} /></div>
      <strong>{value}%</strong>
    </div>
  );
}

function movieToForm(movie) {
  const duration = parseDurationMinutes(movie.duration);
  return {
    title: movie.title || '',
    originalTitle: movie.originalTitle || movie.title || '',
    description: movie.description || '',
    year: String(movie.year || new Date().getFullYear()),
    countries: parseCountries(movie.country),
    genres: movie.genres?.length ? movie.genres : ['Drama'],
    type: movie.type || 'Movie',
    durationHours: String(Math.floor(duration / 60)),
    durationMinutes: String(duration % 60),
    rating: String(movie.rating || '8.0'),
    difficulty: movie.difficulty || 'medium',
    accent: movie.accent || 'american',
    ageRating: movie.ageRating || '16+'
  };
}

function parseCountries(value) {
  if (Array.isArray(value)) return value.length ? value : ['USA'];
  const text = String(value || '').trim();
  if (!text) return ['USA'];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return text.split(',').map((country) => country.trim()).filter(Boolean);
}

function getPerFileProgress(totalProgress, files) {
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

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseDurationMinutes(value) {
  const text = String(value || '');
  if (/^\d+$/.test(text)) return Number(text);
  const hour = Number(text.match(/(\d+)\s*h/)?.[1] || 0);
  const minute = Number(text.match(/(\d+)\s*m/)?.[1] || 0);
  return hour * 60 + minute || 90;
}

function formatDuration(value, locale) {
  const minutes = parseDurationMinutes(value);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  if (locale === 'ru') return `${hour} ч ${minute} мин`;
  if (locale === 'tm') return `${hour} sag ${minute} min`;
  return `${hour} h ${minute} min`;
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
