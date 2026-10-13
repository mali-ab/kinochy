import { ArrowUpRight, Check, Clock3, Heart, MessageCircle, Play, Plus, Send, Star, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, moviePosterFallback } from '../api';
import { withBasePath } from '../paths';
import MoviePlayer from '../player/MoviePlayer.jsx';
import { normalizeSubtitleCues } from '../player/subtitleCues.js';
import { translateAccent, translateDifficulty, translateGenre, useLocale } from '../ui/locale.jsx';

export default function MoviePage() {
  const { slug } = useParams();
  const [movie, setMovie] = useState(null);
  const [favorite, setFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState('');
  const [subtitles, setSubtitles] = useState({ en: [], ru: [] });
  const [subtitlesReady, setSubtitlesReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [comments, setComments] = useState([]);
  const [viewer, setViewer] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [wordTranslations, setWordTranslations] = useState({});
  const [savedWords, setSavedWords] = useState(() => new Set());
  const [activeSeason, setActiveSeason] = useState(1);
  const { locale, t } = useLocale();
  const studyWords = useMemo(() => buildStudyWords(subtitles.en), [subtitles.en]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMovie(null);
    setSubtitles({ en: [], ru: [] });
    setSubtitlesReady(false);
    api(`/api/movies/${slug}`)
      .then((movieData) => {
        if (!active) return;
        setMovie(movieData);
        api(`/api/users/favorites/${movieData.id}`)
          .then((data) => active && setFavorite(Boolean(data.favorite)))
          .catch(() => active && setFavorite(false));
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;
    setWordTranslations({});
    Promise.allSettled(studyWords.map(async (word) => {
      const result = await api(`/api/translate?text=${encodeURIComponent(word)}&from=en&to=ru`);
      return [word, result.translation || ''];
    })).then((results) => {
      if (!active) return;
      setWordTranslations(Object.fromEntries(results.filter((result) => result.status === 'fulfilled').map((result) => result.value)));
    });
    return () => { active = false; };
  }, [studyWords]);

  useEffect(() => {
    let active = true;
    setRecommendations([]);
    setSeasons([]);
    setComments([]);
    setViewer(null);
    setCommentDraft('');
    setCommentError('');
    api(`/api/movies/${slug}/recommendations`).then((data) => active && setRecommendations(Array.isArray(data) ? data : [])).catch(() => {});
    api(`/api/movies/${slug}/seasons`).then((data) => { if (!active) return; const items = Array.isArray(data) ? data : []; setSeasons(items); if (items[0]) setActiveSeason(items[0].number); }).catch(() => {});
    api(`/api/movies/${slug}/comments`).then((data) => active && setComments(Array.isArray(data) ? data : [])).catch(() => {});
    api('/api/users/me').then((data) => active && setViewer(data.user || null)).catch(() => {});
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([api(`/api/movies/${slug}/subtitles/en`), api(`/api/movies/${slug}/subtitles/ru`)]).then((results) => {
      if (!active) return;
      const en = normalizeSubtitleCues(results[0].status === 'fulfilled' ? results[0].value : []);
      const ru = normalizeSubtitleCues(results[1].status === 'fulfilled' ? results[1].value : []);
      setSubtitles({ en, ru });
      setSubtitlesReady(true);
    });
    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) return <div className="status">{t('loading_movie')}</div>;
  if (!movie) return <div className="status">{t('movie_not_found')}</div>;

  async function toggleFavorite() {
    if (favoriteBusy) return;
    const nextFavorite = !favorite;
    setFavoriteBusy(true);
    setFavoriteError('');
    setFavorite(nextFavorite);
    try {
      const data = await api(`/api/users/favorites/${movie.id}`, {
        method: nextFavorite ? 'POST' : 'DELETE',
        body: JSON.stringify({})
      });
      setFavorite(Boolean(data.favorite));
    } catch (error) {
      setFavorite(!nextFavorite);
      setFavoriteError(error.message || 'Could not update favorites. Please try again.');
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function postComment(event) {
    event.preventDefault();
    if (!commentDraft.trim() || commentBusy) return;
    setCommentBusy(true);
    setCommentError('');
    try {
      const comment = await api(`/api/movies/${slug}/comments`, { method: 'POST', body: JSON.stringify({ body: commentDraft.trim() }) });
      setComments((current) => [comment, ...current].slice(0, 50));
      setCommentDraft('');
    } catch (error) {
      setCommentError(error.message || 'Could not post comment.');
    } finally {
      setCommentBusy(false);
    }
  }

  async function deleteComment(id) {
    setCommentError('');
    try {
      await api(`/api/movies/${slug}/comments/${id}`, { method: 'DELETE' });
      setComments((current) => current.filter((comment) => comment.id !== id));
    } catch (error) {
      setCommentError(error.message || 'Could not delete comment.');
    }
  }

  function pronounce(word) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }

  async function saveStudyWord(word) {
    const translation = wordTranslations[word];
    if (!translation || savedWords.has(word)) return;
    try {
      await api('/api/users/vocabulary', { method: 'POST', body: JSON.stringify({ word, translation, sourceLanguage: 'en', targetLanguage: 'ru' }) });
      setSavedWords((current) => new Set(current).add(word));
    } catch { /* Keep the add action available for retry. */ }
  }

  return (
    <section className="movie-page">
      <div className="movie-detail">
        <div className="detail-poster" style={!movie.coverUrl ? { background: moviePosterFallback(movie) } : undefined}>
          {movie.coverUrl ? <img className="detail-poster-image" src={withBasePath(movie.coverUrl)} alt={movie.title} decoding="async" fetchPriority="high" /> : null}
          {!movie.coverUrl ? <span>{movie.title}</span> : null}
        </div>
        <div className="detail-copy">
          <p className="eyebrow">{movie.type === 'Series' ? t('movie_type_series') : movie.type === 'Cartoon' ? t('movie_type_cartoon') : t('movie_type_movie')}</p>
          <h1>{movie.title}</h1>
          <p className="original">{movie.originalTitle}</p>
          <div className="actions">
            <button className={favorite ? 'active-favorite' : ''} disabled={favoriteBusy} onClick={toggleFavorite}>
              <Heart size={18} fill={favorite ? 'currentColor' : 'none'} /> {favorite ? t('remove_favorites') : t('add_favorites')}
            </button>
          </div>
          {favoriteError ? <p className="action-error">{favoriteError}</p> : null}
          <dl className="facts">
            <dt>{t('release_year')}</dt>
            <dd>{movie.year || '—'}</dd>
            <dt>{t('country')}</dt>
            <dd>{movie.country || '—'}</dd>
            <dt>{t('genre')}</dt>
            <dd className="accent">{movie.genres?.length ? movie.genres.map((genre) => translateGenre(locale, genre)).join(', ') : movie.genre}</dd>
            <dt>{t('duration')}</dt>
            <dd>{formatDuration(movie.duration, locale) || t('uploaded_movie')}</dd>
            <dt>{t('rating')}</dt>
            <dd className="rating">
              <Star size={16} fill="currentColor" /> {Number(movie.rating || 8).toFixed(1)} / 10
            </dd>
            <dt>{t('difficulty')}</dt>
            <dd><span className={`difficulty-level ${movie.difficulty || 'medium'}`}>{translateDifficulty(locale, movie.difficulty || 'medium')}</span></dd>
            <dt>{t('accent')}</dt>
            <dd>{movie.accent ? translateAccent(locale, movie.accent) : '—'}</dd>
            <dt>{t('subtitles')}</dt>
            <dd>{!subtitlesReady ? '…' : [subtitles.en.length ? t('admin_subtitle_en') : null, subtitles.ru.length ? t('admin_subtitle_ru') : null].filter(Boolean).join(', ') || '—'}</dd>
          </dl>
          <h2>{t('about_film')}</h2>
          <p className="description">{movie.description}</p>
        </div>
      </div>

      <MoviePlayer movie={movie} subtitles={subtitles} access={viewer?.subscription} />

      {studyWords.length ? (
        <section className="movie-study" aria-labelledby="movie-study-title">
          <h2 id="movie-study-title">{t('movie_recommended')}</h2>
          <div className="movie-study-grid">{studyWords.map((word) => (
            <div className="movie-study-word" key={word}>
              <button type="button" onClick={() => pronounce(word)} aria-label={`Pronounce ${word}`}><Volume2 size={14} /></button>
              <button type="button" className={savedWords.has(word) ? 'saved' : ''} disabled={!wordTranslations[word]} onClick={() => saveStudyWord(word)} aria-label={`Add ${word} to vocabulary`}>{savedWords.has(word) ? <Check size={14} /> : <Plus size={14} />}</button>
              <p><strong>{word}</strong><span> – {wordTranslations[word] || '…'}</span></p>
            </div>
          ))}</div>
        </section>
      ) : null}

      {movie.type === 'Series' ? (
        <section className="movie-extras movie-seasons" aria-labelledby="movie-seasons-title">
          <div className="season-tabs"><strong id="movie-seasons-title">{t('movie_seasons')}</strong>{seasons.map((season) => <button type="button" key={season.number} className={activeSeason === season.number ? 'active' : ''} onClick={() => setActiveSeason(season.number)}>{season.number}</button>)}</div>
          {seasons.length ? seasons.filter((season) => season.number === activeSeason).map((season) => (
            <div className="movie-season" key={season.number}>
              <div className="movie-episode-list">{season.episodes.map((episode,index) => (
                <Link className="movie-episode" key={episode.id} to={`/movies/${episode.slug}`}>
                  <span className="movie-episode-check"><Check size={15} /></span>
                  <span className="movie-episode-label">{t('movie_episode')} {episode.episodeNumber}</span>
                  <span className="movie-episode-play"><Play size={16} fill="currentColor" /></span>
                  <span className="movie-episode-title"><strong>{episode.title}</strong><small>{movie.originalTitle || movie.title}</small></span>
                  {index === 0 ? <span className="episode-preview">Free preview</span> : null}
                  <span className="movie-episode-duration"><Clock3 size={14} /> {formatEpisodeDuration(episode.duration)}</span>
                </Link>
              ))}</div>
            </div>
          )) : <p className="movie-extras-empty">{t('movie_seasons_empty')}</p>}
        </section>
      ) : null}

      <section className="movie-extras" aria-labelledby="movie-recommended-title">
        <div className="movie-extras-heading"><span className="movie-extras-kicker">Kinochy picks</span><h2 id="movie-recommended-title">You may also like</h2></div>
        {recommendations.length ? <div className="movie-recommendations">{recommendations.map((item) => (
          <Link className="movie-recommendation" to={`/movies/${item.slug}`} key={item.id}>
            <span className="movie-recommendation-poster" style={!item.coverUrl ? { background: moviePosterFallback(item) } : undefined}>
              {item.coverUrl ? <img src={withBasePath(item.coverUrl)} alt="" loading="lazy" /> : <span>{item.title?.charAt(0)}</span>}
            </span>
            <span className="movie-recommendation-copy"><strong>{item.title}</strong><small>{item.year || '—'} · {item.genres?.[0] ? translateGenre(locale, item.genres[0]) : item.genre || item.type}</small></span>
          </Link>
        ))}</div> : <p className="movie-extras-empty">{t('movie_recommended_empty')}</p>}
      </section>

      <section className="movie-extras movie-comments" aria-labelledby="movie-comments-title">
        <div className="movie-extras-heading"><span className="movie-extras-kicker"><MessageCircle size={15} /> Kinochy community</span><h2 id="movie-comments-title">{t('movie_comments')}</h2></div>
        {viewer ? <form className="movie-comment-form" onSubmit={postComment}>
          <label htmlFor="movie-comment-body">{viewer.username}</label>
          <textarea id="movie-comment-body" value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={1000} rows={3} placeholder={t('movie_comment_placeholder')} />
          <div><span>{commentDraft.length}/1000</span><button disabled={commentBusy || !commentDraft.trim()}><Send size={16} /> {commentBusy ? t('movie_comment_pending') : t('movie_comment_submit')}</button></div>
        </form> : <p className="movie-comment-signin"><Link to="/login">{t('login')}</Link> {t('movie_comment_signin')}</p>}
        {commentError ? <p className="form-error" role="alert">{commentError}</p> : null}
        {comments.length ? <div className="movie-comment-list">{comments.map((comment) => (
          <article className="movie-comment" key={comment.id}>
            <div className="movie-comment-meta"><span className="movie-comment-avatar" aria-hidden="true">{comment.username?.charAt(0)?.toUpperCase()}</span><strong>{comment.username}</strong><time dateTime={comment.createdAt}>{formatCommentDate(comment.createdAt, locale)}</time>{viewer?.id === comment.userId ? <button type="button" onClick={() => deleteComment(comment.id)} aria-label={t('movie_comment_delete')}><Trash2 size={16} /></button> : null}</div>
            <p>{comment.body}</p>
          </article>
        ))}</div> : <p className="movie-extras-empty">{t('movie_comments_empty')}</p>}
      </section>
    </section>
  );
}

function formatCommentDate(value, locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'tm' ? 'tk-TM' : locale === 'ru' ? 'ru-RU' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function buildStudyWords(cues) {
  const stopWords = new Set('about after again all also and are because been before being but can could did does doing down each for from get got had has have her here him his how into its just know like make many more most much not now off one only other our out over really said say see she should some still such take than that the their them then there these they thing think this those through too under very want was way were what when where which while who why will with would you your'.split(' '));
  const counts = new Map();
  for (const cue of cues || []) {
    for (const raw of String(cue.text || '').toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) {
      const word = raw.replace(/^['-]+|['-]+$/g, '');
      if (!word || stopWords.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return [...counts].sort((a, b) => (b[0].length + Math.min(b[1], 3)) - (a[0].length + Math.min(a[1], 3)) || a[0].localeCompare(b[0])).slice(0, 20).map(([word]) => word);
}

function formatEpisodeDuration(value) {
  const text = String(value || '');
  if (!text) return '—';
  if (text.includes(':')) return text;
  const total = Number(text);
  if (!Number.isFinite(total)) return text;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}:00`;
}

function formatDuration(value, locale) {
  const text = String(value || '');
  if (!/^\d+$/.test(text)) return text;
  const minutes = Number(text);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  if (locale === 'ru') return `${hour} ч ${minute} мин`;
  if (locale === 'tm') return `${hour} sag ${minute} min`;
  return `${hour} h ${minute} min`;
}
