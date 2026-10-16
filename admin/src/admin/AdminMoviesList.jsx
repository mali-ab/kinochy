import { ChevronLeft, ChevronRight, Film, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { moviePosterFallback } from '../api/client';
import { moviesQuery } from '../api/queries';
import { translateDifficulty, useLocale } from '../ui/locale.jsx';
import { AdminRowsSkeleton } from '../ui/skeleton.jsx';

const typeCopy = {
  Movie: { title: 'Films', singular: 'film', empty: 'film' },
  Series: { title: 'Serials', singular: 'serial', empty: 'serial' },
  Cartoon: { title: 'Cartoons', singular: 'cartoon', empty: 'cartoon' }
};
const PAGE_SIZE = 12;

export default function AdminMoviesList({ type = 'Movie' }) {
  const { data, isPending } = useQuery(moviesQuery(''));
  const movies = (data ?? []).filter((movie) => movie.type === type);
  const copy = typeCopy[type] ?? typeCopy.Movie;
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const genre = params.get('genre') || '';
  const difficulty = params.get('difficulty') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { locale } = useLocale();
  const genres = useMemo(() => [...new Set(movies.flatMap((movie) => movie.genres?.length ? movie.genres : [movie.genre]).filter(Boolean))].sort(), [movies]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return movies.filter((movie) => {
      const searchable = `${movie.title} ${movie.originalTitle || ''} ${movie.year || ''}`.toLocaleLowerCase();
      const movieGenres = movie.genres?.length ? movie.genres : [movie.genre];
      return (!term || searchable.includes(term)) && (!genre || movieGenres.includes(genre)) && (!difficulty || (movie.difficulty || 'medium') === difficulty);
    });
  }, [movies, search, genre, difficulty]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function updateFilters(changes) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    setParams(next, { replace: true });
  }

  function clearFilters() {
    setParams({}, { replace: true });
  }

  return (
    <>
      <div className="admin-list-head">
        <div><span className="admin-section-kicker">Content library</span><h2>{copy.title}</h2><p>{movies.length} {copy.singular}{movies.length === 1 ? '' : 's'} in your catalog</p></div>
        <Link className="primary" to={`/admin/movies/new?type=${type}`}>
          <Plus size={18} /> Add title
        </Link>
      </div>
      <div className="admin-filter-bar">
        <label className="admin-search-box"><Search size={17} /><input value={search} onChange={(event) => updateFilters({ search: event.target.value, page: 1 })} placeholder={`Search ${copy.title.toLowerCase()}…`} />{search ? <button aria-label="Clear search" onClick={() => updateFilters({ search: '', page: 1 })}><X size={15} /></button> : null}</label>
        <label className="admin-filter-field"><span>Genre</span><select value={genre} onChange={(event) => updateFilters({ genre: event.target.value, page: 1 })}><option value="">All genres</option>{genres.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="admin-filter-field"><span>Difficulty</span><select value={difficulty} onChange={(event) => updateFilters({ difficulty: event.target.value, page: 1 })}><option value="">All levels</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
        {(search || genre || difficulty) ? <button className="admin-clear-filters" onClick={clearFilters}><SlidersHorizontal size={15} /> Reset</button> : null}
      </div>
      <div className="admin-result-bar"><span><strong>{filtered.length}</strong> results</span><span>Page {currentPage} of {pages}</span></div>

      {isPending ? <AdminRowsSkeleton rows={7} /> : visible.length ? <div className="admin-movie-list">
        {visible.map((movie) => (
          <Link key={movie.id} className="admin-movie-row" to={`/admin/movies/${movie.id}`}>
            <span className="admin-row-cover" style={{ position: 'relative', overflow: 'hidden', ...(movie.coverUrl ? undefined : { background: moviePosterFallback(movie) }) }}>
              {movie.coverUrl ? <img src={movie.coverUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
            </span>
            <span className="admin-row-copy">
              <strong>{movie.title}</strong>
              <small><span>{movie.type}</span><span>{movie.year || '—'}</span><span>{movie.genres?.join(', ') || movie.genre || 'No genre'}</span></small>
            </span>
            <span className={`admin-difficulty ${movie.difficulty || 'medium'}`}>{translateDifficulty(locale, movie.difficulty || 'medium')}</span>
            <ChevronRight className="admin-row-arrow" size={19} />
          </Link>
        ))}
      </div> : <div className="admin-empty-state"><span><Film size={28} /></span><h3>{movies.length ? 'No matching titles' : `No ${copy.title.toLowerCase()} yet`}</h3><p>{movies.length ? 'Change or reset the filters to see more results.' : `Add your first ${copy.empty} to this section.`}</p>{movies.length ? <button className="primary" onClick={clearFilters}>Reset filters</button> : <Link className="primary" to={`/admin/movies/new?type=${type}`}><Plus size={17} /> Add title</Link>}</div>}
      {filtered.length > PAGE_SIZE ? <div className="admin-pagination"><span>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}</span><div><button disabled={currentPage <= 1} onClick={() => updateFilters({ page: currentPage - 1 })}><ChevronLeft size={17} /> Previous</button><button disabled={currentPage >= pages} onClick={() => updateFilters({ page: currentPage + 1 })}>Next <ChevronRight size={17} /></button></div></div> : null}
    </>
  );
}
