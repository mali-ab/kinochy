import { Check, Film, FolderSearch, Image as ImageIcon, Plus, Save, Trash2, Upload } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiUpload } from '../api/client';
import { scanMediaLibrary } from '../api/endpoints';
import { useCountries, useGenres } from '../api/hooks.jsx';
import { adminMovieQuery } from '../api/queries';
import { translateDifficulty, translateGenre, useLocale } from '../ui/locale.jsx';
import { addQualityUpload, cloneMovieForm, getPerFileProgress, initialMovieForm, movieDetailPath, movieQualityOptions, movieToForm, range } from './helpers.js';

/**
 * @param {{ id?: string | null }} props
 */
export default function AdminMovieEditor({ id = null }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedType = searchParams.get('type');
  const relatedSeriesId = searchParams.get('seriesId');
  const relatedSeriesSlug = searchParams.get('seriesSlug');
  const relatedSeriesTitle = searchParams.get('seriesTitle');
  const relatedSeasonNumber = Number(searchParams.get('seasonNumber')) || null;
  const relatedEpisodeNumber = Number(searchParams.get('episodeNumber')) || null;
  const requestedReturnTo = searchParams.get('returnTo');
  const returnTo = requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : null;
  const initialType = ['Movie', 'Series', 'Cartoon'].includes(requestedType) ? requestedType : 'Movie';
  const queryClient = useQueryClient();
  const movieResult = useQuery({ ...adminMovieQuery(id ?? ''), enabled: Boolean(id), retry: false });
  const seriesResult = useQuery({ ...adminMovieQuery(relatedSeriesId ?? ''), enabled: Boolean(relatedSeriesId && !id), retry: false });
  const movie = movieResult.data ?? null;
  const series = seriesResult.data ?? null;
  const genreCatalog = useGenres();
  const countryOptions = useCountries();
  const genres = genreCatalog.length ? genreCatalog : [{ code: 'Drama', tm: 'Drama', en: 'Drama', ru: 'Драма' }];

  if ((id && movieResult.isPending) || (relatedSeriesId && !id && seriesResult.isPending)) return <div className="status">Loading editor...</div>;
  if (relatedSeriesId && !id && !series) return <div className="status">The parent series could not be loaded.</div>;
  return (
    <MovieEditor
      movie={movie}
      templateMovie={series}
      initialType={initialType}
      genres={genres}
      countryOptions={countryOptions}
      relation={relatedSeriesId && relatedSeasonNumber && relatedEpisodeNumber ? { seriesId: relatedSeriesId, seriesSlug: relatedSeriesSlug, seriesTitle: relatedSeriesTitle, seasonNumber: relatedSeasonNumber, episodeNumber: relatedEpisodeNumber } : null}
      onCancel={() => navigate(returnTo || (movie ? movieDetailPath(movie) : series ? movieDetailPath(series) : '/'))}
      onSaved={async (saved) => {
        if (relatedSeriesSlug) await queryClient.invalidateQueries({ queryKey: ['movies', relatedSeriesSlug, 'seasons'] });
        queryClient.setQueryData(['admin', 'movies', saved.id], saved);
        queryClient.invalidateQueries({ queryKey: ['admin', 'movies'] });
        queryClient.invalidateQueries({ queryKey: ['movies'] });
        queryClient.invalidateQueries({ queryKey: ['movie'] });
        queryClient.invalidateQueries({ queryKey: ['subtitles'] });
        navigate(returnTo || (series ? movieDetailPath(series) : movieDetailPath(saved)));
      }}
    />
  );
}

function MovieEditor({ movie, templateMovie = null, initialType, genres, countryOptions = [], relation = null, onCancel, onSaved }) {
  const qualityOnly = Boolean(relation || movie?.type === 'Episode');
  const savedQualities = movie?.streaming?.qualities || [];
  const [form, setForm] = useState(() => {
    if (movie) return cloneMovieForm(movieToForm(movie));
    if (relation && templateMovie) {
      const inherited = movieToForm(templateMovie);
      const suffix = ` — Episode ${relation.episodeNumber}`;
      return cloneMovieForm({ ...inherited, titleTm: `${templateMovie.titleTm || templateMovie.title}${suffix}`, titleEn: `${templateMovie.titleEn || templateMovie.title}${suffix}`, titleRu: `${templateMovie.titleRu || templateMovie.title}${suffix}`, originalTitle: `${templateMovie.originalTitle || templateMovie.title}${suffix}`, type: templateMovie.type === 'Cartoon' ? 'Cartoon' : 'Movie', isSeries: false });
    }
    return cloneMovieForm({ ...initialMovieForm, type: initialType === 'Series' ? 'Movie' : initialType, isSeries: initialType === 'Series' });
  });
  const [sourceType, setSourceType] = useState('hls');
  const [files, setFiles] = useState({});
  const [subtitleUploads, setSubtitleUploads] = useState(() => (movie?.subtitleLanguages || []).map((language) => ({ id: `saved-${language}`, language, file: null, existing: true })));
  const [qualityUploads, setQualityUploads] = useState(() => relation && !movie ? [{ id: `episode-${Date.now()}-720p`, quality: '720p', file: null }] : savedQualities.map((quality) => ({ id: `saved-${quality}`, quality, file: null, existing: true })));
  const [libraryPath, setLibraryPath] = useState(() => `/media/user/Новый том/kinochy/${initialType === 'Cartoon' ? 'cartoons' : initialType === 'Series' ? 'serials' : 'films'}`);
  const [libraryScan, setLibraryScan] = useState(null);
  const [serverMediaPath, setServerMediaPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [coverPreview, setCoverPreview] = useState(movie?.coverUrl || '');
  const [busy, setBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ phase: 'idle', percent: 0 });
  const [progress, setProgress] = useState({});
  const [error, setError] = useState('');
  const { locale } = useLocale();
  const t = useTranslations();

  useEffect(() => {
    if (!files.cover) {
      setCoverPreview(movie?.coverUrl || '');
      return undefined;
    }

    const url = URL.createObjectURL(files.cover);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [files.cover, movie?.coverUrl]);

  useEffect(() => {
    if (!busy) return undefined;
    const preventClose = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventClose);
    return () => window.removeEventListener('beforeunload', preventClose);
  }, [busy]);

  function updateField(event) {
    setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  }

  function updateEpisodeTitle(event) {
    const title = event.target.value;
    setForm((value) => ({ ...value, titleTm: title, titleEn: title, titleRu: title, originalTitle: title }));
  }

  function updateCountries(event) {
    const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
    setForm((value) => ({ ...value, countries: selected.length ? selected : ['United States'] }));
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
    if (event.target.name === 'subtitleZip') {
      setFiles((value) => ({ ...value, subtitleZip: file }));
      setSubtitleUploads((value) => value.map((item) => ({ ...item, file: null })));
    }
    setProgress((value) => ({ ...value, [event.target.name]: 0 }));
  }

  function removeFile(key) {
    setFiles((value) => ({ ...value, [key]: null }));
    setProgress((value) => ({ ...value, [key]: 0 }));
  }

  function changeSource(type) {
    if (type === sourceType) return;
    setSourceType(type);
    setQualityUploads(type === 'hls' ? savedQualities.map((quality) => ({ id: `saved-${quality}`, quality, file: null, existing: true })) : []);
    setServerMediaPath('');
    setLibraryScan(null);
    setProgress({});
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setUploadStatus({ phase: 'uploading', percent: 0 });
    setError('');
    setProgress({});
    const missingFiles = [];
    const selectedQualityUploads = qualityUploads.filter((item) => item.file);
    const emptyQualityUploads = qualityUploads.filter((item) => !item.existing && !item.file);
    const removedQualities = savedQualities.filter((quality) => !qualityUploads.some((item) => item.existing && item.quality === quality));
    if (sourceType === 'library' && !serverMediaPath) missingFiles.push('a title folder from the media library');
    if (!form.isSeries && sourceType === 'hls' && !qualityUploads.some((item) => item.existing || item.file)) missingFiles.push('at least one HLS quality ZIP');
    if (!form.isSeries && sourceType === 'hls' && emptyQualityUploads.length) missingFiles.push(`a ZIP for ${emptyQualityUploads.map((item) => item.quality).join(', ')}`);
    if (missingFiles.length) {
      setBusy(false);
      setUploadStatus({ phase: 'idle', percent: 0 });
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
    Object.entries(files).forEach(([key, file]) => file && (!form.isSeries || key === 'cover') && body.append(key, file));
    if (!form.isSeries && !files.subtitleZip) subtitleUploads.forEach((item) => item.file && body.append(`subtitle_${item.language.toLowerCase()}`, item.file));
    const removedSubtitleLanguages = (movie?.subtitleLanguages || []).filter((language) => !subtitleUploads.some((item) => item.language === language));
    if (!form.isSeries && removedSubtitleLanguages.length) body.append('removeSubtitleLanguages', JSON.stringify(removedSubtitleLanguages));
    if (relation) {
      body.append('seriesId', relation.seriesId);
      body.append('seasonNumber', String(relation.seasonNumber));
      body.append('episodeNumber', String(relation.episodeNumber));
    }
    if (sourceType === 'library') body.append('serverMediaPath', serverMediaPath);
    if (!form.isSeries && sourceType === 'hls' && removedQualities.length) body.append('removeQualities', JSON.stringify(removedQualities));
    if (!form.isSeries) selectedQualityUploads.forEach((item) => body.append(`quality_${item.quality}`, item.file));

    try {
      const saved = await apiUpload(movie ? `/api/admin/movies/${movie.id}` : '/api/admin/movies', {
        method: movie ? 'PATCH' : 'POST',
        body,
        onProgress: (value) => {
          setProgress(getPerFileProgress(value, { ...files, qualityUploads: selectedQualityUploads.map((item) => item.file) }));
          setUploadStatus({ phase: value >= 100 ? 'processing' : 'uploading', percent: value });
        }
      });
      setUploadStatus({ phase: 'complete', percent: 100 });
      await onSaved(saved);
    } catch (err) {
      setError(err.message);
      setUploadStatus({ phase: 'error', percent: 0 });
    } finally {
      setBusy(false);
    }
  }

  const currentFiles = movie?.fileNames || {};

  async function inspectLibrary() {
    setScanning(true);
    setError('');
    setServerMediaPath('');
    try {
      setLibraryScan(await scanMediaLibrary(libraryPath));
    } catch (err) {
      setLibraryScan(null);
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  function chooseLibraryItem(item) {
    setServerMediaPath(item.path);
    setForm((value) => ({
      ...value,
      titleTm: item.title,
      titleEn: item.title,
      titleRu: item.title,
      originalTitle: item.title,
      year: item.year ? String(item.year) : value.year,
      type: item.type === 'Cartoon' ? 'Cartoon' : value.type,
      isSeries: Boolean(item.episodes?.length)
    }));
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <div className="admin-list-head admin-editor-heading">
        <div><span className="admin-editor-eyebrow">Dilewar studio / Movie library</span><h2>{relation ? `Add episode ${relation.episodeNumber}` : movie?.type === 'Episode' ? 'Edit episode media' : movie ? 'Edit movie' : 'Add a movie'}</h2><p>{qualityOnly ? 'Manage the video qualities and subtitles for this episode.' : 'Set up the details, choose a playback source, then publish.'}</p></div>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      {relation ? <p className="form-message">Adding episode {relation.episodeNumber} to {relation.seriesTitle || 'series'}, season {relation.seasonNumber}. Saving will link this movie automatically.</p> : null}
      {qualityOnly ? <div className="episode-title-field"><label>Episode title<input required maxLength="200" value={form.titleEn} onChange={updateEpisodeTitle} placeholder="Enter the episode title" /></label></div> : null}
      {!qualityOnly ? <><div className="admin-editor-roadmap" aria-label="Publishing steps">
        <span className="active"><strong>01</strong><small>Localized metadata</small></span>
        <span className={form.isSeries ? 'muted' : ''}><strong>02</strong><small>{form.isSeries ? 'Series structure' : 'Playback source'}</small></span>
        <span><strong>03</strong><small>Artwork & subtitles</small></span>
      </div>
      <div className="admin-editor-section-head"><span className="admin-editor-step">01</span><div><h3>Title details</h3><p>Help viewers find the right film and language level.</p></div></div>
      <div className="form-grid">
        <fieldset className="localized-copy wide"><legend>Title name</legend><div className="localized-fields">
          <label>Turkmen (TK)<input name="titleTm" required value={form.titleTm} onChange={updateField} /></label>
          <label>English (EN)<input name="titleEn" required value={form.titleEn} onChange={updateField} /></label>
          <label>Russian (RU)<input name="titleRu" required value={form.titleRu} onChange={updateField} /></label>
        </div></fieldset>
        <label>{t('admin_original_title')}<input name="originalTitle" value={form.originalTitle} onChange={updateField} /></label>
        <label>{t('admin_year')}<input name="year" type="number" inputMode="numeric" min="1888" max={new Date().getFullYear() + 5} step="1" required value={form.year} onChange={updateField} /></label>
        <label>{t('admin_country')}<select className="multi-select" multiple value={form.countries} onChange={updateCountries}>{countryOptions.map((country) => <option key={country.code} value={country.name}>{country.name}</option>)}</select></label>
        <label className="wide">{t('admin_genres')}<div className="genre-chips">{genres.map((genre) => <button type="button" key={genre.code} className={form.genres.includes(genre.code) ? 'active' : ''} onClick={() => toggleGenre(genre.code)}>{translateGenre(locale, genre.code, genres)}</button>)}</div></label>
        <label>Category<select name="type" value={form.type} onChange={updateField}><option value="Movie">Movie</option><option value="Cartoon">Cartoon</option></select></label>
        <fieldset className="wide content-format"><legend>How is this title watched?</legend>
          <div className="source-switch" role="group" aria-label="Title format">
            <button type="button" className={!form.isSeries ? 'active' : ''} aria-pressed={!form.isSeries} onClick={() => setForm((value) => ({ ...value, isSeries: false }))}><Film size={22} /><span><strong>Standalone</strong><small>One video, multiple qualities</small></span></button>
            <button type="button" className={form.isSeries ? 'active' : ''} aria-pressed={form.isSeries} onClick={() => setForm((value) => ({ ...value, isSeries: true }))}><Plus size={22} /><span><strong>Series</strong><small>Seasons and episodes, each with its own video</small></span></button>
          </div>
          <p className="source-note">{form.isSeries ? `Publish this ${form.type === 'Cartoon' ? 'cartoon' : 'movie'} series, then create seasons and upload each episode’s qualities and subtitles.` : 'Upload the video qualities and subtitles below.'}</p>
          {movie?.fileStatus?.video && form.isSeries ? <p className="source-note">The existing main video stays stored, but this title will play through its episodes. Upload episode videos inside its seasons.</p> : null}
        </fieldset>
        <label>{t('admin_duration')}<div className="duration-picker"><select name="durationHours" value={form.durationHours} onChange={updateField}>{range(0, 6).map((hour) => <option key={hour} value={hour}>{hour} h</option>)}</select><select name="durationMinutes" value={form.durationMinutes} onChange={updateField}>{range(0, 59).map((minute) => <option key={minute} value={minute}>{minute} min</option>)}</select></div></label>
        <label>{t('admin_rating')}<input name="rating" value={form.rating} onChange={updateField} /></label>
        <label>{t('understanding_difficulty')}<select name="difficulty" value={form.difficulty} onChange={updateField}><option value="easy">{translateDifficulty(locale, 'easy')}</option><option value="medium">{translateDifficulty(locale, 'medium')}</option><option value="hard">{translateDifficulty(locale, 'hard')}</option></select></label>
        <fieldset className="localized-copy wide"><legend>Title description</legend><div className="localized-fields localized-descriptions">
          <label>Turkmen (TK)<textarea name="descriptionTm" rows="5" required value={form.descriptionTm} onChange={updateField} /></label>
          <label>English (EN)<textarea name="descriptionEn" rows="5" required value={form.descriptionEn} onChange={updateField} /></label>
          <label>Russian (RU)<textarea name="descriptionRu" rows="5" required value={form.descriptionRu} onChange={updateField} /></label>
        </div></fieldset>
      </div>
      </> : null}

      <div className="admin-editor-section-head"><span className="admin-editor-step">{qualityOnly ? '01' : '02'}</span><div><h3>{form.isSeries ? 'Series episodes' : qualityOnly ? 'Episode video qualities' : 'Video qualities'}</h3><p>{form.isSeries ? 'Add episodes after publishing, or import a complete series folder.' : qualityOnly ? 'Upload one HLS ZIP for every quality available for this episode.' : 'Upload a ZIP for each quality, or select a converted HLS folder on the server.'}</p></div></div>
      {!qualityOnly ? <div className="source-switch" role="group" aria-label="Playback source">
        <button type="button" className={sourceType === 'hls' ? 'active' : ''} onClick={() => changeSource('hls')} aria-pressed={sourceType === 'hls'}><Upload size={18} /><span><strong>{form.isSeries ? 'Add episodes after saving' : 'HLS quality ZIPs'}</strong><small>{form.isSeries ? 'Create seasons and upload episode videos' : 'One ZIP for each resolution'}</small></span></button>
        <button type="button" className={sourceType === 'library' ? 'active' : ''} onClick={() => changeSource('library')} aria-pressed={sourceType === 'library'}><FolderSearch size={18} /><span><strong>Server folder</strong><small>Import converted HLS instantly</small></span></button>
      </div> : null}
      {sourceType === 'library' ? <div className="media-library-import">
        <div className="media-library-path"><FolderSearch size={20} /><input value={libraryPath} onChange={(event) => setLibraryPath(event.target.value)} placeholder="/media/user/Новый том/kinochy/films" /><button type="button" onClick={inspectLibrary} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan folder'}</button></div>
        <p>The backend reads this server directory directly. Movies use <code>Title/quality/stream.m3u8</code>. Series use <code>Series/Season 1/Episode 1/quality/stream.m3u8</code>. Put language-coded subtitles inside each movie or episode folder.</p>
        {libraryScan?.items?.length ? <div className="media-library-results">{libraryScan.items.map((item) => <button type="button" key={item.path} className={serverMediaPath === item.path ? 'selected' : ''} onClick={() => chooseLibraryItem(item)}><span className="media-library-check">{serverMediaPath === item.path ? <Check size={16} /> : <Film size={16} />}</span><span><strong>{item.title}{item.year ? ` (${item.year})` : ''}</strong><small>{item.type}{item.episodes?.length ? ` · ${item.episodes.length} episodes · ${new Set(item.episodes.map((episode) => episode.seasonNumber)).size} seasons` : ` · ${item.qualities.join(', ')} · subtitles: ${item.subtitleLanguages.join(', ') || 'none'}`}</small>{item.episodes?.length ? <span className="media-library-episodes">{item.episodes.map((episode) => <i key={`${episode.seasonNumber}-${episode.episodeNumber}`}>S{episode.seasonNumber} E{episode.episodeNumber} · {episode.qualities.join(', ')}</i>)}</span> : null}{item.warnings.map((warning) => <em key={warning}>{warning}</em>)}</span></button>)}</div> : null}
      </div> : null}
      {!form.isSeries && sourceType === 'hls' ? <p className="source-note bundle-note"><strong>Required:</strong> each ZIP represents one quality and must contain an M3U8 playlist with its media segments.{qualityOnly ? '' : ' Keep subtitles in their own ZIP below.'}</p> : null}
      {!form.isSeries && sourceType === 'hls' ? <div className="quality-upload-panel">
        <div className="quality-upload-head"><div><strong>HLS quality ZIPs</strong><small>Add one ZIP per resolution. Include an M3U8 playlist and its media segments.</small></div><button type="button" disabled={qualityUploads.length >= movieQualityOptions.length} onClick={() => addQualityUpload(setQualityUploads, qualityUploads)}><Plus size={16} /> Add quality</button></div>
        {qualityUploads.length ? <div className="quality-upload-list">{qualityUploads.map((item) => <div className="quality-upload-row" key={item.id}>
          <select aria-label="Video quality" value={item.quality} disabled={item.existing} onChange={(event) => setQualityUploads((value) => value.map((entry) => entry.id === item.id ? { ...entry, quality: event.target.value } : entry))}>{movieQualityOptions.map((quality) => <option key={quality} value={quality} disabled={qualityUploads.some((entry) => entry.id !== item.id && entry.quality === quality)}>{quality === '2160p' ? '2160p · 4K' : quality === '1440p' ? '1440p · 2K' : quality}</option>)}</select>
          <label className={item.existing && !item.file ? 'quality-saved' : ''}><Upload size={17} /><span>{item.file ? item.file.name : item.existing ? `${item.quality} uploaded · choose ZIP to replace` : `${item.quality} HLS ZIP`}</span><input type="file" accept=".zip,application/zip" onChange={(event) => { const file = event.target.files[0] || null; setQualityUploads((value) => value.map((entry) => entry.id === item.id ? { ...entry, file } : entry)); event.target.value = ''; }} /></label>
          {item.existing && item.file ? <button type="button" className="quality-remove" onClick={() => setQualityUploads((value) => value.map((entry) => entry.id === item.id ? { ...entry, file: null } : entry))}>Cancel</button> : <button type="button" className="quality-remove" onClick={() => setQualityUploads((value) => value.filter((entry) => entry.id !== item.id))}>Remove</button>}
        </div>)}</div> : <p className="quality-upload-empty">Use this when your converter produces separate 360p, 720p, 1080p, or 4K ZIP bundles. Dilewar creates the adaptive master playlist automatically.</p>}
      </div> : null}
      {form.isSeries && sourceType === 'hls' ? <p className="source-note bundle-note"><strong>Series workflow:</strong> publish the series title first. On its details page, create seasons and then add playable episodes inside each season.</p> : null}

      {!qualityOnly ? <><div className="admin-editor-section-head"><span className="admin-editor-step">{form.isSeries ? '02' : '03'}</span><div><h3>Artwork & subtitle tracks</h3><p>{form.isSeries ? 'Add artwork for the series title. Episode subtitles belong to each episode movie.' : 'Add English, Russian, and Turkish tracks separately, or upload them together in a ZIP.'}</p></div></div>
      <div className="upload-grid">
        <FileBox icon={<ImageIcon />} name="cover" label={t('admin_cover_image')} accept="image/*" file={files.cover} current={currentFiles.cover} preview={coverPreview} progress={progress.cover} onChange={updateFile} onRemove={() => removeFile('cover')} />
        {!form.isSeries ? <><div className="subtitle-bundle-upload"><FileBox icon={<Upload />} name="subtitleZip" label="Subtitle ZIP · EN + RU + TK" accept=".zip,application/zip" file={files.subtitleZip} progress={progress.subtitleZip} onChange={updateFile} onRemove={() => removeFile('subtitleZip')} /><p>Name each file with its language code: <code>movie.en.srt</code>, <code>movie.ru.srt</code>, <code>movie.tk.vtt</code>.</p></div>{!files.subtitleZip ? <SubtitleTrackEditor tracks={subtitleUploads} setTracks={setSubtitleUploads} /> : null}</> : null}
      </div>
      </> : null}

      {qualityOnly ? <><div className="admin-editor-section-head"><span className="admin-editor-step">02</span><div><h3>Episode subtitles</h3><p>Add as many subtitle languages as this episode needs.</p></div></div>
      <div className="upload-grid episode-subtitle-grid">
        <div className="subtitle-bundle-upload"><FileBox icon={<Upload />} name="subtitleZip" label="Subtitle ZIP · EN + RU + TK" accept=".zip,application/zip" file={files.subtitleZip} progress={progress.subtitleZip} onChange={updateFile} onRemove={() => removeFile('subtitleZip')} /><p>Use <code>episode.en.srt</code>, <code>episode.ru.srt</code>, and <code>episode.tk.vtt</code>.</p></div>
        {!files.subtitleZip ? <SubtitleTrackEditor tracks={subtitleUploads} setTracks={setSubtitleUploads} /> : null}
      </div></> : null}

      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary admin-publish" disabled={busy}>
        <Save size={18} /> {busy ? t('admin_uploading') : relation ? 'Publish episode' : movie?.type === 'Episode' ? 'Save episode qualities' : movie ? 'Save movie' : t('admin_publish')}
      </button>
      {busy ? <UploadStatus status={uploadStatus} /> : null}
    </form>
  );
}

const subtitleLanguageOptions = [
  ['en','English'],['ru','Russian'],['tk','Turkish']
];

function SubtitleTrackEditor({ tracks, setTracks }) {
  function addTrack() {
    const language = subtitleLanguageOptions.find(([code]) => !tracks.some((item) => item.language === code))?.[0] || `lang${tracks.length + 1}`;
    setTracks((value) => [...value, { id: `${Date.now()}-${language}`, language, file: null, existing: false }]);
  }
  return <div className="subtitle-track-editor">
    <div className="subtitle-track-editor-head"><div><strong>Individual subtitle tracks</strong><small>Select a language, then choose its SRT or VTT file.</small></div><button type="button" onClick={addTrack}><Plus size={16} /> Add language</button></div>
    {tracks.map((item) => <div className="subtitle-track-upload" key={item.id}>
      <select aria-label="Subtitle language" value={item.language} disabled={item.existing} required onChange={(event) => setTracks((value) => value.map((track) => track.id === item.id ? { ...track, language: event.target.value } : track))}>{subtitleLanguageOptions.map(([code,label]) => <option key={code} value={code} disabled={tracks.some((track) => track.id !== item.id && track.language === code)}>{label} · {code.toUpperCase()}</option>)}</select>
      <label><Upload size={16} /><span>{item.file?.name || (item.existing ? `${item.language.toUpperCase()} subtitles uploaded` : 'Choose SRT or VTT')}</span><input type="file" accept=".srt,.vtt,text/vtt" onChange={(event) => { const file=event.target.files[0]||null;setTracks((value)=>value.map((track)=>track.id===item.id?{...track,file}:track));event.target.value=''; }} /></label>
      <button type="button" className="danger" aria-label={`Remove ${item.language} subtitles`} onClick={() => setTracks((value) => value.filter((track) => track.id !== item.id))}><Trash2 size={16} /></button>
    </div>)}
    {!tracks.length ? <p>No individual tracks yet. Add a language or use the ZIP uploader above.</p> : null}
  </div>;
}

function UploadStatus({ status }) {
  const processing = status.phase === 'processing';
  return (
    <div className="movie-upload-overlay" role="dialog" aria-modal="true" aria-live="polite">
      <div className="movie-upload-card">
        <span className="movie-upload-spinner" aria-hidden="true" />
        <h3>{processing ? 'Preparing your movie…' : 'Uploading movie…'}</h3>
        <p>{processing ? 'The server is validating playlists, extracting files, and saving the movie.' : 'Keep this page open while your files are transferred.'}</p>
        <div className="movie-upload-meter"><span style={{ width: `${status.percent}%` }} /></div>
        <strong>{processing ? 'Processing on server' : `${status.percent}% uploaded`}</strong>
        <small>Large HLS bundles can take several minutes. Do not close or refresh this page.</small>
      </div>
    </div>
  );
}

function FileBox({ icon, label, file, current, preview, progress, onRemove, required, ...props }) {
  const text = file?.name || current || label;
  const inputId = `file-${props.name}`;
  const status = file ? (current ? 'Will replace uploaded file' : 'Selected') : current ? 'Uploaded' : required ? 'Required' : 'Optional';
  return (
    <div className="file-box has-actions">
      <label htmlFor={inputId} className="file-picker-main">
        {preview ? <span className="file-preview" style={{ position: 'relative', overflow: 'hidden' }}><img src={preview} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /></span> : icon}
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
