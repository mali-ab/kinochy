'use client';

import { Film, Image as ImageIcon, Plus, Save, Upload } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiUpload } from '../api/client';
import { useGenres } from '../api/hooks.jsx';
import { adminMovieQuery } from '../api/queries';
import { translateDifficulty, translateGenre, useLocale } from '../ui/locale.jsx';
import { addQualityUpload, cloneMovieForm, countryOptions, formatFileSize, getPerFileProgress, initialMovieForm, movieQualityOptions, movieToForm, range } from './helpers.js';

/**
 * @param {{ id?: string | null }} props
 */
export default function AdminMovieEditor({ id = null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const movieResult = useQuery({ ...adminMovieQuery(id ?? ''), enabled: Boolean(id), retry: false });
  const movie = movieResult.data ?? null;
  const genreCatalog = useGenres();
  const genres = genreCatalog.length ? genreCatalog : [{ code: 'Drama', tm: 'Drama', en: 'Drama', ru: 'Драма' }];

  if (id && movieResult.isPending) return <div className="status">Loading editor...</div>;
  return (
    <MovieEditor
      movie={movie}
      genres={genres}
      onCancel={() => router.push(movie ? `/admin/movies/${movie.id}` : '/admin')}
      onSaved={(saved) => {
        queryClient.invalidateQueries({ queryKey: ['movies'] });
        queryClient.invalidateQueries({ queryKey: ['movie'] });
        queryClient.invalidateQueries({ queryKey: ['subtitles'] });
        router.push(`/admin/movies/${saved.id}`);
      }}
    />
  );
}

function MovieEditor({ movie, genres, onCancel, onSaved }) {
  const [form, setForm] = useState(() => cloneMovieForm(movie ? movieToForm(movie) : initialMovieForm));
  const [sourceType, setSourceType] = useState(movie?.streaming?.hls ? 'hls' : 'video');
  const [files, setFiles] = useState({});
  const [hlsFiles, setHlsFiles] = useState([]);
  const [qualityUploads, setQualityUploads] = useState(() => (movie?.streaming?.qualities || []).map((quality) => ({ id: `saved-${quality}`, quality, file: null, existing: true })));
  const [coverPreview, setCoverPreview] = useState(movie?.coverUrl || '');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState('');
  const { locale, t } = useLocale();

  useEffect(() => {
    if (!files.cover) {
      setCoverPreview(movie?.coverUrl || '');
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
    if (event.target.name === 'video') {
      setQualityUploads([]);
      if (file.name.toLowerCase().endsWith('.zip')) setHlsFiles([]);
    }
    if (event.target.name === 'subtitleZip') setFiles((value) => ({ ...value, subtitleZip: file, subtitleEn: null, subtitleRu: null }));
    if (event.target.name === 'subtitleEn' || event.target.name === 'subtitleRu') setFiles((value) => ({ ...value, [event.target.name]: file, subtitleZip: null }));
    setProgress((value) => ({ ...value, [event.target.name]: 0 }));
  }

  function removeFile(key) {
    setFiles((value) => ({ ...value, [key]: null }));
    setProgress((value) => ({ ...value, [key]: 0 }));
  }

  function changeSource(type) {
    if (type === sourceType) return;
    setSourceType(type);
    setFiles((value) => ({ ...value, video: null }));
    setHlsFiles([]);
    setQualityUploads([]);
    setProgress({});
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setProgress({});
    const missingFiles = [];
    const selectedQualityUploads = qualityUploads.filter((item) => item.file);
    if (!files.video && selectedQualityUploads.length === 0 && (!currentStatus.video || Boolean(movie?.streaming?.hls) !== (sourceType === 'hls'))) missingFiles.push(sourceType === 'hls' ? 'HLS ZIP, M3U8 playlist, or quality ZIP' : t('admin_movie_file'));
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
    selectedQualityUploads.forEach((item) => body.append(`quality_${item.quality}`, item.file));

    try {
      const saved = await apiUpload(movie ? `/api/admin/movies/${movie.id}` : '/api/admin/movies', {
        method: movie ? 'PATCH' : 'POST',
        body,
        onProgress: (value) => setProgress(getPerFileProgress(value, { ...files, hlsFiles, qualityUploads: selectedQualityUploads.map((item) => item.file) }))
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
        <label className="wide">{t('admin_genres')}<div className="genre-chips">{genres.map((genre) => <button type="button" key={genre.code} className={form.genres.includes(genre.code) ? 'active' : ''} onClick={() => toggleGenre(genre.code)}>{translateGenre(locale, genre.code, genres)}</button>)}</div></label>
        <label>{t('admin_type')}<select name="type" value={form.type} onChange={updateField}><option value="Movie">{t('movie_type_movie')}</option><option value="Series">{t('movie_type_series')}</option><option value="Cartoon">{t('movie_type_cartoon')}</option></select></label>
        <label>{t('admin_duration')}<div className="duration-picker"><select name="durationHours" value={form.durationHours} onChange={updateField}>{range(0, 6).map((hour) => <option key={hour} value={hour}>{hour} h</option>)}</select><select name="durationMinutes" value={form.durationMinutes} onChange={updateField}>{range(0, 59).map((minute) => <option key={minute} value={minute}>{minute} min</option>)}</select></div></label>
        <label>{t('admin_rating')}<input name="rating" value={form.rating} onChange={updateField} /></label>
        <label>{t('understanding_difficulty')}<select name="difficulty" value={form.difficulty} onChange={updateField}><option value="easy">{translateDifficulty(locale, 'easy')}</option><option value="medium">{translateDifficulty(locale, 'medium')}</option><option value="hard">{translateDifficulty(locale, 'hard')}</option></select></label>
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
      {sourceType === 'hls' ? <div className="quality-upload-panel">
        <div className="quality-upload-head"><div><strong>Separate quality ZIPs</strong><small>Add one ZIP per resolution. Each ZIP must contain one playable M3U8 playlist and all of its segments.</small></div><button type="button" disabled={qualityUploads.length >= movieQualityOptions.length} onClick={() => { setFiles((value) => ({ ...value, video: null })); setHlsFiles([]); addQualityUpload(setQualityUploads, qualityUploads); }}><Plus size={16} /> Add quality</button></div>
        {qualityUploads.length ? <div className="quality-upload-list">{qualityUploads.map((item) => <div className="quality-upload-row" key={item.id}>
          <select aria-label="Video quality" value={item.quality} disabled={item.existing} onChange={(event) => setQualityUploads((value) => value.map((entry) => entry.id === item.id ? { ...entry, quality: event.target.value } : entry))}>{movieQualityOptions.map((quality) => <option key={quality} value={quality} disabled={qualityUploads.some((entry) => entry.id !== item.id && entry.quality === quality)}>{quality === '2160p' ? '2160p · 4K' : quality === '1440p' ? '1440p · 2K' : quality}</option>)}</select>
          <label className={item.existing && !item.file ? 'quality-saved' : ''}><Upload size={17} /><span>{item.file ? item.file.name : item.existing ? `${item.quality} uploaded · choose ZIP to replace` : `${item.quality} HLS ZIP`}</span><input type="file" accept=".zip,application/zip" onChange={(event) => { const file = event.target.files[0] || null; setQualityUploads((value) => value.map((entry) => entry.id === item.id ? { ...entry, file } : entry)); event.target.value = ''; }} /></label>
          {item.existing ? item.file ? <button type="button" className="quality-remove" onClick={() => setQualityUploads((value) => value.map((entry) => entry.id === item.id ? { ...entry, file: null } : entry))}>Cancel</button> : <span className="quality-current">Saved</span> : <button type="button" className="quality-remove" onClick={() => setQualityUploads((value) => value.filter((entry) => entry.id !== item.id))}>Remove</button>}
        </div>)}</div> : <p className="quality-upload-empty">Use this when your converter produces separate 360p, 720p, 1080p, or 4K ZIP bundles. Kinochy creates the adaptive master playlist automatically.</p>}
      </div> : null}

      <div className="admin-editor-section-head"><span className="admin-editor-step">03</span><div><h3>Artwork & subtitle bundle</h3><p>Upload one subtitle ZIP for both languages, or select the files separately.</p></div></div>
      <div className="upload-grid">
        <FileBox icon={<ImageIcon />} name="cover" label={t('admin_cover_image')} accept="image/*" file={files.cover} current={currentFiles.cover} preview={coverPreview} progress={progress.cover} onChange={updateFile} onRemove={() => removeFile('cover')} />
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

function FileBox({ icon, label, file, current, preview, progress, onRemove, required, ...props }) {
  const text = file?.name || current || label;
  const inputId = `file-${props.name}`;
  const status = file ? (current ? 'Will replace uploaded file' : 'Selected') : current ? 'Uploaded' : required ? 'Required' : 'Optional';
  return (
    <div className="file-box has-actions">
      <label htmlFor={inputId} className="file-picker-main">
        {preview ? <span className="file-preview" style={{ position: 'relative', overflow: 'hidden' }}><Image src={preview} alt="" fill sizes="150px" style={{ objectFit: 'cover' }} /></span> : icon}
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
