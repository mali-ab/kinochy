import { ChevronLeft, ChevronRight, Film, MessageSquareText, MessagesSquare, Search, Trash2, Users, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { deleteAdminComment } from '../api/endpoints';
import { adminCommentsQuery, moviesQuery, queryKeys } from '../api/queries';
import { useConfirm } from './confirm.jsx';

const PAGE_SIZES = [10, 25, 50, 100];

export default function AdminComments() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = PAGE_SIZES.includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 25;
  const search = params.get('search') || '';
  const movieId = params.get('movieId') || '';
  const [searchDraft, setSearchDraft] = useState(search);
  const filters = { page, pageSize, search, movieId };
  const { data, isPending, isFetching, error } = useQuery(adminCommentsQuery(filters));
  const { data: movies = [] } = useQuery(moviesQuery(''));
  const queryClient = useQueryClient();
  const { requestConfirm } = useConfirm();
  const remove = useMutation({
    mutationFn: deleteAdminComment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'comments'] })
  });

  useEffect(() => setSearchDraft(search), [search]);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const items = data?.items ?? [];

  function updateFilters(changes) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    setParams(next, { replace: true });
  }

  function submitSearch(event) {
    event.preventDefault();
    updateFilters({ search: searchDraft.trim(), page: 1 });
  }

  function confirmDelete(comment) {
    requestConfirm({
      title: 'Delete comment?',
      body: `This will permanently remove ${comment.username}'s comment from “${comment.movieTitle}”.`,
      actionLabel: 'Delete comment',
      danger: true,
      onConfirm: () => remove.mutateAsync(comment.id)
    });
  }

  return (
    <>
      <div className="admin-list-head">
        <div><span className="admin-section-kicker">Community moderation</span><h2>Comments</h2><p>{total} comment{total === 1 ? '' : 's'} found</p></div>
      </div>
      <section className="admin-view-metrics" aria-label="Comment overview">
        <article><span><MessagesSquare size={19} /></span><div><strong>{total}</strong><small>Matching comments</small></div></article>
        <article><span><Film size={19} /></span><div><strong>{movies.length}</strong><small>Catalog titles</small></div></article>
        <article><span><Users size={19} /></span><div><strong>{new Set(items.map((comment) => comment.userId)).size}</strong><small>Authors on this page</small></div></article>
      </section>

      <div className="admin-comment-filters">
        <form onSubmit={submitSearch} className="admin-comment-search">
          <Search size={17} />
          <input aria-label="Search comments" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search text, user, email, or title" maxLength={100} />
          {searchDraft ? <button type="button" aria-label="Clear search" onClick={() => { setSearchDraft(''); updateFilters({ search: '', page: 1 }); }}><X size={16} /></button> : null}
          <button className="primary" type="submit">Search</button>
        </form>
        <label>Movie<select value={movieId} onChange={(event) => updateFilters({ movieId: event.target.value, page: 1 })}><option value="">All movies</option>{movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title}</option>)}</select></label>
        <label>Per page<select value={pageSize} onChange={(event) => updateFilters({ pageSize: event.target.value, page: 1 })}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
      </div>

      {error ? <p className="form-message error">{error.message}</p> : null}
      <div className={`admin-comments-panel${isFetching ? ' loading' : ''}`}>
        {isPending ? <div className="admin-comments-status">Loading comments…</div> : items.length ? items.map((comment) => (
          <article className="admin-comment-card" key={comment.id}>
            <div className="admin-comment-meta">
              <span className="admin-comment-avatar">{comment.username?.slice(0, 1).toUpperCase() || '?'}</span>
              <div><strong>{comment.username}</strong><small>{comment.email}</small></div>
              <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
            </div>
            <p>{comment.body}</p>
            <div className="admin-comment-actions">
              <Link to={`/movies/${comment.movieId}`}><MessageSquareText size={15} /> {comment.movieTitle}</Link>
              <button className="danger" disabled={remove.isPending} onClick={() => confirmDelete(comment)}><Trash2 size={16} /> Delete</button>
            </div>
          </article>
        )) : <div className="admin-empty-state"><span><MessageSquareText size={28} /></span><h3>No comments found</h3><p>Try changing the search or movie filter.</p></div>}
      </div>

      <div className="admin-pagination">
        <span>Page {Math.min(page, pages)} of {pages}</span>
        <div>
          <button disabled={page <= 1 || isFetching} onClick={() => updateFilters({ page: page - 1 })}><ChevronLeft size={17} /> Previous</button>
          <button disabled={page >= pages || isFetching} onClick={() => updateFilters({ page: page + 1 })}>Next <ChevronRight size={17} /></button>
        </div>
      </div>
    </>
  );
}
