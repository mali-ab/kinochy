'use client';

import { Heart, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { moviePosterFallback } from '../api/client';
import { useFavorites } from '../api/hooks.jsx';
import { translateGenre, useLocale } from '../ui/locale.jsx';
import { MovieCardSkeleton } from '../ui/skeleton.jsx';

export default function FavoritesView() {
  const { favorites: movies, loading } = useFavorites();
  const { locale, t } = useLocale();

  return (
    <section className="catalog-page favorites-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">{t('nav_favorites')}</p>
          <h1>{t('favorites_title')}</h1>
        </div>
      </div>

      {!loading && !movies.length ? <div className="empty-state">{t('empty_favorites')}</div> : null}

      <div className="movie-grid" aria-busy={loading || undefined}>
        {loading ? Array.from({ length: 8 }, (_, index) => <MovieCardSkeleton key={index} />) : movies.map((movie, index) => (
          <Link key={movie.id} className="movie-card" href={`/movies/${movie.slug}`}>
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
              <span className="age">{movie.ageRating || '16+'}</span>
              <span className="favorite-badge" title={t('nav_favorites')}>
                <Heart size={15} fill="currentColor" />
              </span>
              <span className="kind">{movie.type === 'Series' ? t('movie_type_series') : movie.type === 'Cartoon' ? t('movie_type_cartoon') : t('movie_type_movie')}</span>
              <span className="score">
                <Star size={13} fill="currentColor" /> {Number(movie.rating || 8).toFixed(1)}
              </span>
              {!movie.coverUrl ? (
                <div className="poster-title">
                  <span>{movie.genres?.[0] ? translateGenre(locale, movie.genres[0]) : movie.genre || 'English'}</span>
                  <strong>{movie.title}</strong>
                </div>
              ) : null}
            </div>
            <strong className="movie-title">{movie.title}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
