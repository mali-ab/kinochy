'use client';

import { ArrowUpRight, Heart, Play, Sparkles, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { moviePosterFallback } from '../api/client';
import { useFavoriteIds, useGenres, useMovies } from '../api/hooks.jsx';
import { catalogUrl, categoryLabelKey, movieUrl, normalizeType } from '../catalog/urls';
import { useEnumLabels } from '../i18n/useEnumLabels.jsx';
import { useLocale } from '../ui/locale.jsx';
import { CatalogFeatureSkeleton, MovieCardSkeleton } from '../ui/skeleton.jsx';

/**
 * Shared catalog listing for the home library, the category routes and their
 * genre routes. Category and genre live in the URL, not in local state.
 * @param {{ categoryKey?: 'Movie' | 'Series' | 'Cartoon' | null, genreCode?: string | null }} props
 */
export default function CatalogView({ categoryKey = null, genreCode = null }) {
  const { locale } = useLocale();
  const { genre: genreLabel, difficulty: difficultyLabel } = useEnumLabels();
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.get('search') || '';
  const [filters, setFilters] = useState({ year: 'all', sort: 'popular' });
  const { movies, loading } = useMovies(search);
  const genres = useGenres();
  const favoriteIds = useFavoriteIds();

  const pool = useMemo(
    () => (categoryKey ? movies.filter((movie) => normalizeType(movie.type) === categoryKey) : movies),
    [movies, categoryKey]
  );

  const filterOptions = useMemo(
    () => ({ genres, years: unique(pool.map((movie) => movie.year).filter(Boolean)).sort((a, b) => b - a) }),
    [pool, genres]
  );

  const catalog = useMemo(() => {
    const filtered = pool
      .filter((movie) => {
        if (!genreCode) return true;
        const movieGenres = movie.genres?.length ? movie.genres : movie.genre ? [movie.genre] : [];
        return movieGenres.includes(genreCode);
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
  }, [pool, genreCode, filters]);

  function updateFilter(event) {
    setFilters((value) => ({ ...value, [event.target.name]: event.target.value }));
  }

  // Genre selection is reflected in the URL instead of local state.
  function changeGenre(event) {
    if (!categoryKey) return;
    const value = event.target.value;
    const path = value === 'all' ? catalogUrl(locale, { category: categoryKey }) : catalogUrl(locale, { category: categoryKey, genre: value });
    router.push(search ? `${path}?search=${encodeURIComponent(search)}` : path);
  }

  const emptyLabel = categoryKey === 'Series' ? t('empty_series') : categoryKey === 'Cartoon' ? t('empty_cartoons') : t('empty_movies');
  const featured = !search && !genreCode ? pool.find((movie) => movie.coverUrl) || pool[0] : null;
  const categoryLabel = categoryKey ? t(categoryLabelKey(categoryKey)) : t('catalog_library');
  const heading = search ? t('catalog_results') : genreCode ? `${genreLabel(genreCode, genres)} · ${categoryLabel}` : categoryLabel;
  const eyebrow = heading === t('catalog_library') ? '' : t('catalog_library');
  const featuredGenre = featured?.genres?.[0] || featured?.genre;

  return (
    <section className="catalog-page">
      {loading && !search ? <CatalogFeatureSkeleton /> : featured ? (
        <div className="catalog-feature" style={!featured.coverUrl ? { background: moviePosterFallback(featured) } : undefined}>
          {featured.coverUrl ? (
            <Image
              className="catalog-feature-image"
              src={featured.coverUrl}
              alt=""
              fill
              priority
              sizes="66vw"
              style={{ inset: '-50% -2% -50% auto', }}
            />
          ) : null}
          <div className="catalog-feature-copy">
            <span className="feature-kicker"><Sparkles size={15} /> {t('catalog_spotlight')}</span>
            <div className="feature-meta">
              {featured.year ? <span>{featured.year}</span> : null}
              {featuredGenre ? <span>{genreLabel(featuredGenre, genres)}</span> : null}
              <span>{featured.type === 'Cartoon' ? t('movie_type_cartoon') : featured.type === 'Series' ? t('movie_type_series') : t('movie_type_movie')}</span>
            </div>
            <h1>{featured.title}</h1>
            {featured.description ? <p>{featured.description}</p> : null}
            <Link className="feature-play" href={movieUrl(locale, featured)}><Play size={18} fill="currentColor" /> {t('catalog_watch')}</Link>
          </div>
          {!featured.coverUrl ? <div className="feature-monogram" aria-hidden="true">{featured.title?.charAt(0)}</div> : null}
        </div>
      ) : null}

      <div className="catalog-heading">
        <div>
          {eyebrow ? <span className="catalog-eyebrow">{eyebrow}</span> : null}
          <h2>{heading}</h2>
        </div>
        {!loading ? <span className="catalog-count">{catalog.length} {t('catalog_titles')}</span> : null}
      </div>

      <div className="filters">
        {categoryKey ? (
          <select className="filter-select genre-filter" name="genre" value={genreCode || 'all'} onChange={changeGenre} aria-label={t('filters_genre')}>
            <option value="all">{t('filters_genre')}</option>
            {filterOptions.genres.map((genre) => (
              <option key={genre.code} value={genre.code}>
                {genreLabel(genre.code, genres)}
              </option>
            ))}
          </select>
        ) : null}
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

      {!loading && !catalog.length ? <div className="empty-state">{emptyLabel}</div> : null}

      <div className="movie-grid" aria-busy={loading || undefined}>
        {loading ? Array.from({ length: 12 }, (_, index) => <MovieCardSkeleton key={index} />) : catalog.map((movie, index) => (
          <Link key={movie.id} className="movie-card" href={movieUrl(locale, movie)}>
            <div className="poster" style={!movie.coverUrl ? { background: moviePosterFallback(movie) } : undefined}>
              {movie.coverUrl ? (
                <Image
                  className="poster-image"
                  src={movie.coverUrl}
                  alt={movie.title}
                  fill
                  priority={index < 2}
                  sizes="(max-width: 620px) 45vw, (max-width: 980px) 30vw, 174px"
                />
              ) : null}
              <span className={`difficulty-poster ${movie.difficulty || 'medium'}`}>{difficultyLabel(movie.difficulty || 'medium')}</span>
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
                  <span>{movie.genres?.[0] ? genreLabel(movie.genres[0], genres) : movie.genre || 'English'}</span>
                  <strong>{movie.title}</strong>
                </div>
              ) : null}
              <span className="poster-hover">
                <span className="poster-hover-play"><Play size={18} fill="currentColor" /></span>
                <strong>{movie.title}</strong>
                <small>{movie.genres?.[0] ? genreLabel(movie.genres[0], genres) : movie.genre || t('movie_type_movie')}<br />{movie.year || '—'}</small>
              </span>
            </div>
            <div className="movie-card-copy">
              <strong className="movie-title">{movie.title}</strong>
              <span className="movie-card-details">{movie.year || '—'} <span>·</span> {movie.genres?.[0] ? genreLabel(movie.genres[0], genres) : movie.genre || t('movie_type_movie')} <span>·</span> <span className={`difficulty-inline ${movie.difficulty || 'medium'}`}>{difficultyLabel(movie.difficulty || 'medium')}</span></span>
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
