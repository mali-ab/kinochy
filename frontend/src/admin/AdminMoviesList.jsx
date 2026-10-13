'use client';

import { ChevronRight, Film, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { moviePosterFallback } from '../api/client';
import { moviesQuery } from '../api/queries';
import { translateDifficulty, useLocale } from '../ui/locale.jsx';
import { AdminRowsSkeleton } from '../ui/skeleton.jsx';

export default function AdminMoviesList() {
  const { data, isPending } = useQuery(moviesQuery(''));
  const movies = data ?? [];
  const [message, setMessage] = useState('');
  const { locale } = useLocale();

  return (
    <>
      <div className="admin-list-head">
        <div><span className="admin-section-kicker">Content library</span><h2>Movies</h2><p>{movies.length} title{movies.length === 1 ? '' : 's'} in your catalog</p></div>
        <Link className="primary" href="/admin/movies/new">
          <Plus size={18} /> Add movie
        </Link>
      </div>
      {message ? <p className="form-message">{message}</p> : null}
      {isPending ? <AdminRowsSkeleton rows={7} /> : movies.length ? <div className="admin-movie-list">
        {movies.map((movie) => (
          <Link key={movie.id} className="admin-movie-row" href={`/admin/movies/${movie.id}`}>
            <span className="admin-row-cover" style={{ position: 'relative', overflow: 'hidden', ...(movie.coverUrl ? undefined : { background: moviePosterFallback(movie) }) }}>
              {movie.coverUrl ? <Image src={movie.coverUrl} alt="" fill sizes="82px" style={{ objectFit: 'cover' }} /> : null}
            </span>
            <span className="admin-row-copy">
              <strong>{movie.title}</strong>
              <small><span>{movie.type}</span><span>{movie.year || '—'}</span><span>{movie.genres?.join(', ') || movie.genre || 'No genre'}</span></small>
            </span>
            <span className={`admin-difficulty ${movie.difficulty || 'medium'}`}>{translateDifficulty(locale, movie.difficulty || 'medium')}</span>
            <ChevronRight className="admin-row-arrow" size={19} />
          </Link>
        ))}
      </div> : <div className="admin-empty-state"><span><Film size={28} /></span><h3>Your catalog is empty</h3><p>Add your first movie, series, or cartoon to begin.</p><Link className="primary" href="/admin/movies/new"><Plus size={17} /> Add movie</Link></div>}
    </>
  );
}
