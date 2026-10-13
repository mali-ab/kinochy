'use client';

import { Edit3, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { moviePosterFallback } from '../api/client';
import { useAddEpisode, useDeleteMovie, useRemoveEpisode, useSubtitles } from '../api/hooks.jsx';
import { adminMovieQuery, moviesQuery, seasonsQuery } from '../api/queries';
import MoviePlayer from '../player/MoviePlayer.jsx';
import { translateDifficulty, translateGenre, useLocale } from '../ui/locale.jsx';
import { useConfirm } from './confirm.jsx';
import { formatDuration } from './helpers.js';
import { AdminDetailSkeleton } from '../ui/skeleton.jsx';

export default function AdminMovieDetail({ id }) {
  const router = useRouter();
  const { requestConfirm } = useConfirm();
  const movieResult = useQuery({ ...adminMovieQuery(id), retry: false });
  const movie = movieResult.data ?? null;
  const { subtitles, ready: subtitlesReady } = useSubtitles(movie?.slug);
  const deleteMovieMutation = useDeleteMovie();
  const { locale } = useLocale();

  function deleteMovie() {
    deleteMovieMutation.mutate(id, { onSuccess: () => router.push('/admin') });
  }

  if (movieResult.isPending) return <AdminDetailSkeleton />;
  if (!movie) return <div className="status">Movie not found.</div>;
  if (!subtitlesReady) return <AdminDetailSkeleton />;

  return (
    <div className="admin-detail">
      <div className="admin-detail-head">
        <button onClick={() => router.push('/admin')}>Back</button>
        <div className="admin-actions">
          <Link href={`/admin/movies/${movie.id}/edit`}>
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
        <div className="admin-movie-cover" style={{ position: 'relative', overflow: 'hidden', ...(movie.coverUrl ? undefined : { background: moviePosterFallback(movie) }) }}>
          {movie.coverUrl ? <Image src={movie.coverUrl} alt={movie.title} fill sizes="(max-width: 620px) 240px, 340px" style={{ objectFit: 'cover' }} /> : null}
        </div>
        <div>
          <h2>{movie.title}</h2>
          <p>{movie.description}</p>
          <dl className="admin-facts">
            <dt>Type</dt><dd>{movie.type}</dd>
            <dt>Year</dt><dd>{movie.year}</dd>
            <dt>Genres</dt><dd>{movie.genres?.map((genre) => translateGenre(locale, genre)).join(', ') || movie.genre}</dd>
            <dt>Duration</dt><dd>{formatDuration(movie.duration, locale)}</dd>
            <dt>Rating</dt><dd>{movie.rating}</dd>
            <dt>Understanding</dt><dd><span className={`admin-difficulty ${movie.difficulty || 'medium'}`}>{translateDifficulty(locale, movie.difficulty || 'medium')}</span></dd>
          </dl>
        </div>
      </div>
      <MoviePlayer movie={movie} subtitles={subtitles} access={{ hasFullAccess: true }} />
      {movie.type === 'Series' ? <AdminSeriesEpisodes movie={movie} /> : null}
    </div>
  );
}

function AdminSeriesEpisodes({ movie }) {
  const seasonsResult = useQuery({ ...seasonsQuery(movie.slug), retry: false });
  const catalogResult = useQuery(moviesQuery(''));
  const seasons = seasonsResult.data ?? [];
  const catalog = (catalogResult.data ?? []).filter((item) => item.id !== movie.id);
  const addEpisodeMutation = useAddEpisode(movie.id, movie.slug);
  const removeEpisodeMutation = useRemoveEpisode(movie.id, movie.slug);
  const [form, setForm] = useState({ movieId: '', seasonNumber: '1', episodeNumber: '1', title: '' });
  const [error, setError] = useState('');

  function submitAddEpisode(event) {
    event.preventDefault();
    setError('');
    addEpisodeMutation.mutate(
      { movieId: form.movieId, seasonNumber: Number(form.seasonNumber), episodeNumber: Number(form.episodeNumber), title: form.title || null },
      {
        onSuccess: () => setForm((current) => ({ ...current, movieId: '', episodeNumber: String(Number(current.episodeNumber) + 1), title: '' })),
        onError: (issue) => setError(issue.message)
      }
    );
  }

  function removeEpisode(episodeId) {
    setError('');
    removeEpisodeMutation.mutate(episodeId, { onError: (issue) => setError(issue.message) });
  }

  return <section className="admin-series-panel">
    <h3>Seasons & episodes</h3>
    <p>Add each playable episode as a movie first, then link it to this series.</p>
    <form onSubmit={submitAddEpisode}>
      <label>Season<input type="number" min="1" max="100" required value={form.seasonNumber} onChange={(event) => setForm((current) => ({ ...current, seasonNumber: event.target.value }))} /></label>
      <label>Episode<input type="number" min="1" max="1000" required value={form.episodeNumber} onChange={(event) => setForm((current) => ({ ...current, episodeNumber: event.target.value }))} /></label>
      <label>Movie<select required value={form.movieId} onChange={(event) => setForm((current) => ({ ...current, movieId: event.target.value }))}><option value="">Choose a movie</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Episode title (optional)<input maxLength="200" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
      <button className="primary" disabled={addEpisodeMutation.isPending || !form.movieId}><Plus size={16} /> Add episode</button>
    </form>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {seasons.map((season) => <div className="admin-season" key={season.number}><h4>Season {season.number}</h4>{season.episodes.map((episode) => <div key={episode.id}><span>{episode.episodeNumber}. {episode.title}</span><button type="button" onClick={() => removeEpisode(episode.id)} aria-label={`Remove ${episode.title}`}><Trash2 size={15} /> Remove</button></div>)}</div>)}
  </section>;
}
