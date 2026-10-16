import { ChevronLeft, ChevronRight, Edit3, MessageSquareText, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { moviePosterFallback } from '../api/client';
import { deleteAdminComment } from '../api/endpoints';
import { useAddEpisode, useDeleteMovie, useRemoveEpisode, useSubtitles } from '../api/hooks.jsx';
import { adminCommentsQuery, adminMovieQuery, moviesQuery, seasonsQuery } from '../api/queries';
import MoviePlayer from '../player/MoviePlayer.jsx';
import { translateDifficulty, translateGenre, useLocale } from '../ui/locale.jsx';
import { useConfirm } from './confirm.jsx';
import { formatDuration } from './helpers.js';
import { AdminDetailSkeleton } from '../ui/skeleton.jsx';

export default function AdminMovieDetail({ id }) {
  const navigate = useNavigate();
  const { requestConfirm } = useConfirm();
  const movieResult = useQuery({ ...adminMovieQuery(id), retry: false });
  const movie = movieResult.data ?? null;
  const { subtitles, ready: subtitlesReady } = useSubtitles(movie?.slug);
  const deleteMovieMutation = useDeleteMovie();
  const { locale } = useLocale();

  function deleteMovie() {
    deleteMovieMutation.mutate(id, { onSuccess: () => navigate('/admin') });
  }

  if (movieResult.isPending) return <AdminDetailSkeleton />;
  if (!movie) return <div className="status">Movie not found.</div>;
  if (!subtitlesReady) return <AdminDetailSkeleton />;

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
        <div className="admin-movie-cover" style={{ position: 'relative', overflow: 'hidden', ...(movie.coverUrl ? undefined : { background: moviePosterFallback(movie) }) }}>
          {movie.coverUrl ? <img src={movie.coverUrl} alt={movie.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
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
      <AdminMovieComments movie={movie} />
    </div>
  );
}

function AdminMovieComments({ movie }) {
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const filters = { page, pageSize, search: '', movieId: movie.id };
  const commentsResult = useQuery(adminCommentsQuery(filters));
  const queryClient = useQueryClient();
  const { requestConfirm } = useConfirm();
  const comments = commentsResult.data?.items ?? [];
  const total = commentsResult.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const removeComment = useMutation({
    mutationFn: deleteAdminComment,
    onSuccess: async () => {
      if (comments.length === 1 && page > 1) setPage((current) => current - 1);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'comments'] });
    }
  });

  function confirmDelete(comment) {
    requestConfirm({
      title: 'Delete comment?',
      body: `Remove ${comment.username}'s comment from “${movie.title}”? This cannot be undone.`,
      actionLabel: 'Delete comment',
      danger: true,
      onConfirm: () => removeComment.mutateAsync(comment.id)
    });
  }

  return (
    <section className="admin-detail-comments">
      <div className="admin-detail-comments-head">
        <div><span className="admin-section-kicker">Community</span><h3>Comments</h3><p>{total} comment{total === 1 ? '' : 's'} on this title</p></div>
        <MessageSquareText size={22} />
      </div>
      {commentsResult.error ? <p className="form-error">{commentsResult.error.message}</p> : null}
      <div className={`admin-comments-panel${commentsResult.isFetching ? ' loading' : ''}`}>
        {commentsResult.isPending ? <div className="admin-comments-status">Loading comments…</div> : comments.length ? comments.map((comment) => (
          <article className="admin-comment-card" key={comment.id}>
            <div className="admin-comment-meta">
              <span className="admin-comment-avatar">{comment.username?.slice(0, 1).toUpperCase() || '?'}</span>
              <div><strong>{comment.username}</strong><small>{comment.email}</small></div>
              <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
            </div>
            <p>{comment.body}</p>
            <div className="admin-comment-actions admin-comment-actions-end">
              <button className="danger" disabled={removeComment.isPending} onClick={() => confirmDelete(comment)}><Trash2 size={16} /> Delete</button>
            </div>
          </article>
        )) : <div className="admin-comments-empty"><MessageSquareText size={26} /><strong>No comments yet</strong><span>Viewer comments for this movie will appear here.</span></div>}
      </div>
      {total > pageSize ? <div className="admin-pagination"><span>Page {page} of {pages}</span><div><button disabled={page <= 1 || commentsResult.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={17} /> Previous</button><button disabled={page >= pages || commentsResult.isFetching} onClick={() => setPage((current) => current + 1)}>Next <ChevronRight size={17} /></button></div></div> : null}
    </section>
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
