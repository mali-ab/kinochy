import { ChevronLeft, ChevronRight, Edit3, MessageSquareText, Play, Plus, Trash2, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { moviePosterFallback } from '../api/client';
import { deleteAdminComment } from '../api/endpoints';
import { useAddSeason, useDeleteMovie, useRemoveEpisode, useRemoveSeason, useSubtitles } from '../api/hooks.jsx';
import { adminCommentsQuery, adminMovieQuery, seasonsQuery } from '../api/queries';
import MoviePlayer from '../player/MoviePlayer.jsx';
import { translateDifficulty, translateGenre, useLocale } from '../ui/locale.jsx';
import { useConfirm } from './confirm.jsx';
import { formatDuration, movieDetailPath, movieSection } from './helpers.js';
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
    deleteMovieMutation.mutate(id, { onSuccess: () => navigate('/') });
  }

  if (movieResult.isPending) return <AdminDetailSkeleton />;
  if (!movie) return <div className="status">Movie not found.</div>;
  if (!subtitlesReady) return <AdminDetailSkeleton />;

  return (
    <div className="admin-detail">
      <div className="admin-detail-head">
        <button onClick={() => navigate(`/${movieSection(movie.type)}`)}>Back</button>
        <div className="admin-actions">
          <Link to={`${movieDetailPath(movie)}/edit`}>
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
      <div className="admin-detail-statusbar">
        <span className={movie.isSeries || movie.fileStatus?.video ? 'ready' : 'pending'}>{movie.isSeries ? 'Series title' : movie.fileStatus?.video ? 'Playback ready' : 'Metadata only'}</span>
        <span>{movie.isSeries ? 'Seasons & episodes' : movie.streaming?.hls ? 'Adaptive HLS' : movie.fileStatus?.video ? 'Single video' : 'No main video'}</span>
        {!movie.isSeries ? <span>{movie.streaming?.qualities?.length ? movie.streaming.qualities.join(' · ') : 'Default quality'}</span> : null}
        <span>Updated {movie.updatedAt ? new Date(movie.updatedAt).toLocaleDateString() : 'recently'}</span>
      </div>
      <div className="admin-movie-detail">
        <div className="admin-movie-cover" style={{ position: 'relative', overflow: 'hidden', ...(movie.coverUrl ? undefined : { background: moviePosterFallback(movie) }) }}>
          {movie.coverUrl ? <img src={movie.coverUrl} alt={movie.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        </div>
        <div>
          <h2>{movie.titleEn || movie.title}</h2>
          <div className="admin-localized-summary">
            <div><span>TK</span><strong>{movie.titleTm || movie.title}</strong><p>{movie.descriptionTm || movie.description}</p></div>
            <div><span>EN</span><strong>{movie.titleEn || movie.title}</strong><p>{movie.descriptionEn || movie.description}</p></div>
            <div><span>RU</span><strong>{movie.titleRu || movie.title}</strong><p>{movie.descriptionRu || movie.description}</p></div>
          </div>
          <dl className="admin-facts">
            <dt>Type</dt><dd>{movie.type}</dd>
            <dt>Format</dt><dd>{movie.isSeries ? 'Series · seasons & episodes' : 'Standalone · one video'}</dd>
            <dt>Year</dt><dd>{movie.year}</dd>
            <dt>Genres</dt><dd>{movie.genres?.map((genre) => translateGenre(locale, genre)).join(', ') || movie.genre}</dd>
            <dt>Duration</dt><dd>{formatDuration(movie.duration, locale)}</dd>
            <dt>Rating</dt><dd>{movie.rating}</dd>
            <dt>Understanding</dt><dd><span className={`admin-difficulty ${movie.difficulty || 'medium'}`}>{translateDifficulty(locale, movie.difficulty || 'medium')}</span></dd>
          </dl>
        </div>
      </div>
      {movie.fileStatus?.video ? <MoviePlayer movie={movie} subtitles={subtitles} access={{ hasFullAccess: true }} /> : null}
      {movie.isSeries ? <AdminSeriesEpisodes movie={movie} /> : null}
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
  const seasons = seasonsResult.data ?? [];
  const addSeasonMutation = useAddSeason(movie.id, movie.slug);
  const removeSeasonMutation = useRemoveSeason(movie.id, movie.slug);
  const removeEpisodeMutation = useRemoveEpisode(movie.id, movie.slug);
  const [seasonForm, setSeasonForm] = useState({ seasonNumber: '1', title: '' });
  const [previewEpisodeId, setPreviewEpisodeId] = useState(null);
  const [error, setError] = useState('');

  function createSeason(event) {
    event.preventDefault();
    setError('');
    addSeasonMutation.mutate(
      { seasonNumber: Number(seasonForm.seasonNumber), title: seasonForm.title || null },
      {
        onSuccess: (createdSeasons) => setSeasonForm({ seasonNumber: String(Math.max(0, ...createdSeasons.map((season) => season.number)) + 1), title: '' }),
        onError: (issue) => setError(issue.message)
      }
    );
  }

  function removeEpisode(episodeId) {
    setError('');
    removeEpisodeMutation.mutate(episodeId, { onError: (issue) => setError(issue.message) });
  }

  function removeSeason(seasonNumber) {
    setError('');
    removeSeasonMutation.mutate(seasonNumber, { onError: (issue) => setError(issue.message) });
  }

  return <section className="admin-series-panel">
    <h3>Seasons & episodes</h3>
    <p>Create a season first, then create each playable episode directly inside that season.</p>
    <form className="admin-season-create" onSubmit={createSeason}>
      <label>Season number<input type="number" min="1" max="100" required value={seasonForm.seasonNumber} onChange={(event) => setSeasonForm((current) => ({ ...current, seasonNumber: event.target.value }))} /></label>
      <label>Season title (optional)<input maxLength="200" value={seasonForm.title} onChange={(event) => setSeasonForm((current) => ({ ...current, title: event.target.value }))} /></label>
      <button className="primary" disabled={addSeasonMutation.isPending}><Plus size={16} /> Create season</button>
    </form>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {seasons.map((season) => {
      const nextEpisode = Math.max(0, ...season.episodes.map((episode) => episode.episodeNumber)) + 1;
      const episodeParams = new URLSearchParams({ type: movie.type, seriesId: movie.id, seriesSlug: movie.slug, seriesTitle: movie.titleEn || movie.title, seasonNumber: String(season.number), episodeNumber: String(nextEpisode) });
      return <div className="admin-season" key={season.number}>
        <div className="admin-season-head"><h4>Season {season.number}{season.title ? ` · ${season.title}` : ''}</h4><button type="button" className="danger" disabled={season.episodes.length > 0 || removeSeasonMutation.isPending} onClick={() => removeSeason(season.number)}><Trash2 size={15} /> Delete season</button></div>
        {season.episodes.map((episode) => {
          const editParams = new URLSearchParams({ returnTo: movieDetailPath(movie), seriesSlug: movie.slug });
          return <div className="admin-season-episode" key={episode.id}><span>{episode.episodeNumber}. {episode.title}</span><div><button type="button" className="episode-watch" onClick={() => setPreviewEpisodeId(episode.movieId)}><Play size={15} /> Test player</button><Link to={`/movies/${episode.movieId}/edit?${editParams}`}><Edit3 size={15} /> Edit</Link><button type="button" onClick={() => removeEpisode(episode.id)} aria-label={`Remove ${episode.title}`}><Trash2 size={15} /> Remove</button></div></div>;
        })}
        <div className="admin-episode-create"><div><strong>Next: episode {nextEpisode}</strong><small>Upload HLS quality bundles and episode subtitles.</small></div><Link className="primary" to={`/movies/new?${episodeParams}`}><Plus size={16} /> Add episode</Link></div>
      </div>;
    })}
    {previewEpisodeId ? <EpisodeTestPlayer movieId={previewEpisodeId} onClose={() => setPreviewEpisodeId(null)} /> : null}
  </section>;
}

function EpisodeTestPlayer({ movieId, onClose }) {
  const movieResult = useQuery({ ...adminMovieQuery(movieId), retry: false });
  const movie = movieResult.data ?? null;
  const { subtitles, ready: subtitlesReady } = useSubtitles(movie?.slug);

  return <section className="admin-episode-preview" aria-label="Episode test player">
      <div className="admin-episode-preview-head">
        <div><span>Episode test player</span><strong>{movie?.titleEn || movie?.title || 'Loading episode…'}</strong>{movie ? <small>{movie.streaming?.qualities?.length ? movie.streaming.qualities.join(' · ') : 'Default quality'} · Full admin access</small> : null}</div>
        <button type="button" onClick={onClose} aria-label="Close episode player"><X size={18} /> Close</button>
      </div>
      <div className="admin-episode-preview-body">
        {movieResult.isPending || !subtitlesReady ? <div className="status">Loading episode player...</div> : movieResult.error || !movie ? <p className="form-error">The episode could not be loaded.</p> : movie.fileStatus?.video ? <MoviePlayer movie={movie} subtitles={subtitles} access={{ hasFullAccess: true }} /> : <p className="form-error">This episode has no playable video.</p>}
      </div>
    </section>;
}
