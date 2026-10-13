import { ArrowUpRight, Heart, Play, Sparkles, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, moviePosterFallback } from '../api';
import { withBasePath } from '../paths';
import { normalizeGenreCatalog, translateDifficulty, translateGenre, useLocale } from '../ui/locale.jsx';

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const [movies, setMovies] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [genres, setGenres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ genre: 'all', year: 'all', sort: 'popular' });
  const { locale, t } = useLocale();
  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || 'Movie';

  useEffect(() => {
    setLoading(true);
    api(`/api/movies?search=${encodeURIComponent(search)}`)
      .then(setMovies)
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    api('/api/genres')
      .then((data) => setGenres(normalizeGenreCatalog(data)))
      .catch(() => setGenres([]));
    api('/api/users/favorites/ids')
      .then((data) => setFavoriteIds(Array.isArray(data) ? data : []))
      .catch(() => setFavoriteIds([]));
  }, []);

  const filterOptions = useMemo(() => {
    const byCategory = movies.filter((movie) => normalizeType(movie.type) === category);
    return {
      genres,
      years: unique(byCategory.map((movie) => movie.year).filter(Boolean)).sort((a, b) => b - a)
    };
  }, [movies, category, genres]);

  const catalog = useMemo(() => {
    const filtered = movies
      .filter((movie) => normalizeType(movie.type) === category)
      .filter((movie) => {
        if (filters.genre === 'all') return true;
        const genres = movie.genres?.length ? movie.genres : movie.genre ? [movie.genre] : [];
        return genres.includes(filters.genre);
      })
      .filter((movie) => filters.year === 'all' || String(movie.year) === filters.year);

    return filtered.sort((a, b) => {
      if (filters.sort === 'rating') return Number(b.rating || 0) - Number(a.rating || 0);
      if (filters.sort === 'new') return Number(b.year || 0) - Number(a.year || 0);
      if (filters.sort === 'old') return Number(a.year || 0) - Number(b.year || 0);
      if (filters.sort === 'az') return a.title.localeCompare(b.title);
      if (filters.sort === 'za') return b.title.localeCompare(a.title);
      return Number(b.rating || 0) - Number(a.rating || 0);
    });
  }, [movies, category, filters]);

  function updateFilter(event) {
    setFilters((value) => ({ ...value, [event.target.name]: event.target.value }));
  }

  const emptyLabel = category === 'Series' ? t('empty_series') : category === 'Cartoon' ? t('empty_cartoons') : t('empty_movies');
  const featured = !search ? catalog.find((movie) => movie.coverUrl) || catalog[0] : null;
  const categoryLabel = category === 'Series' ? t('nav_series') : category === 'Cartoon' ? t('nav_cartoons') : t('nav_movies');
  const featuredGenre = featured?.genres?.[0] || featured?.genre;

  return (
    <section className="catalog-page">
      {featured ? (
        <div className="catalog-feature" style={!featured.coverUrl ? { background: moviePosterFallback(featured) } : undefined}>
          {featured.coverUrl ? <img className="catalog-feature-image" src={withBasePath(featured.coverUrl)} alt="" /> : null}
          <div className="catalog-feature-copy">
            <span className="feature-kicker"><Sparkles size={15} /> {t('catalog_spotlight')}</span>
            <div className="feature-meta">
              {featured.year ? <span>{featured.year}</span> : null}
              {featuredGenre ? <span>{translateGenre(locale, featuredGenre, genres)}</span> : null}
              <span>{featured.type === 'Cartoon' ? t('movie_type_cartoon') : featured.type === 'Series' ? t('movie_type_series') : t('movie_type_movie')}</span>
            </div>
            <h1>{featured.title}</h1>
            {featured.description ? <p>{featured.description}</p> : null}
            <Link className="feature-play" to={`/movies/${featured.slug}`}><Play size={18} fill="currentColor" /> {t('catalog_watch')}</Link>
          </div>
          {!featured.coverUrl ? <div className="feature-monogram" aria-hidden="true">{featured.title?.charAt(0)}</div> : null}
        </div>
      ) : null}

      <div className="catalog-heading">
        <div>
          <span className="catalog-eyebrow">{t('catalog_library')}</span>
          <h2>{search ? t('catalog_results') : categoryLabel}</h2>
        </div>
        {!loading ? <span className="catalog-count">{catalog.length} {t('catalog_titles')}</span> : null}
      </div>

      <div className="filters">
        <select className="filter-select genre-filter" name="genre" value={filters.genre} onChange={updateFilter} aria-label={t('filters_genre')}>
          <option value="all">{t('filters_genre')}</option>
          {filterOptions.genres.map((genre) => (
            <option key={genre.code} value={genre.code}>
              {translateGenre(locale, genre.code, genres)}
            </option>
          ))}
        </select>
        <select className="filter-select year-filter" name="year" value={filters.year} onChange={updateFilter} aria-label={t('filters_year')}>
          <option value="all">{t('filters_year')}</option>
          {filterOptions.years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select className="filter-select sort-button" name="sort" value={filters.sort} onChange={updateFilter} aria-label={t('catalog_sort')}>
          <option value="popular">{t('filters_popular')}</option>
          <option value="rating">{t('filters_rating')}</option>
          <option value="new">{t('filters_newest')}</option>
          <option value="old">{t('filters_oldest')}</option>
          <option value="az">{t('filters_az')}</option>
          <option value="za">{t('filters_za')}</option>
        </select>
      </div>

      {loading ? <div className="status">{t('loading_movies')}</div> : null}
      {!loading && !catalog.length ? <div className="empty-state">{emptyLabel}</div> : null}

      <div className="movie-grid">
        {catalog.map((movie, index) => (
          <Link key={movie.id} className="movie-card" to={`/movies/${movie.slug}`}>
            <div className="poster" style={!movie.coverUrl ? { background: moviePosterFallback(movie) } : undefined}>
              {movie.coverUrl ? (
                <img
                  className="poster-image"
                  src={withBasePath(movie.coverUrl)}
                  alt={movie.title}
                  loading={index < 4 ? 'eager' : 'lazy'}
                  decoding="async"
                  fetchPriority={index < 2 ? 'high' : 'low'}
                  sizes="(max-width: 620px) 45vw, (max-width: 980px) 30vw, 174px"
                />
              ) : null}
              <span className={`difficulty-poster ${movie.difficulty || 'medium'}`}>{translateDifficulty(locale, movie.difficulty || 'medium')}</span>
              <span className="age">{movie.ageRating || '16+'}</span>
              {favoriteIds.includes(movie.id) ? (
                <span className="favorite-badge" title={t('nav_favorites')}>
                  <Heart size={15} fill="currentColor" />
                </span>
              ) : null}
              <span className="kind">{movie.type === 'Series' ? t('movie_type_series') : movie.type === 'Cartoon' ? t('movie_type_cartoon') : t('movie_type_movie')}</span>
              <span className="score">
                <Star size={13} fill="currentColor" /> {Number(movie.rating || 8).toFixed(1)}
              </span>
              {!movie.coverUrl ? (
                <div className="poster-title">
                  <span>{movie.genres?.[0] ? translateGenre(locale, movie.genres[0], genres) : movie.genre || 'English'}</span>
                  <strong>{movie.title}</strong>
                </div>
              ) : null}
              <span className="poster-hover">
                <span className="poster-hover-play"><Play size={18} fill="currentColor" /></span>
                <strong>{movie.title}</strong>
                <small>{movie.genres?.[0] ? translateGenre(locale, movie.genres[0], genres) : movie.genre || t('movie_type_movie')}<br />{movie.year || '—'}</small>
              </span>
            </div>
            <div className="movie-card-copy">
              <strong className="movie-title">{movie.title}</strong>
              <span className="movie-card-details">{movie.year || '—'} <span>·</span> {movie.genres?.[0] ? translateGenre(locale, movie.genres[0], genres) : movie.genre || t('movie_type_movie')} <span>·</span> <span className={`difficulty-inline ${movie.difficulty || 'medium'}`}>{translateDifficulty(locale, movie.difficulty || 'medium')}</span></span>
              <ArrowUpRight className="movie-card-arrow" size={17} aria-hidden="true" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeType(type) {
  if (type === 'Animation' || type === 'Animations' || type === 'Cartoon' || type === 'Cartoons') return 'Cartoon';
  if (type === 'Series') return 'Series';
  return 'Movie';
}
