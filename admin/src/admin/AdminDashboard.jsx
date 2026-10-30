import { Activity, ArrowUpRight, Clapperboard, Crown, Film, Languages, MessageSquareText, MonitorPlay, Plus, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { moviePosterFallback } from '../api/client';
import { adminCommentsQuery, adminUsersQuery, moviesQuery } from '../api/queries';
import { movieDetailPath } from './helpers.js';

export default function AdminDashboard() {
  const moviesResult = useQuery(moviesQuery(''));
  const usersResult = useQuery(adminUsersQuery());
  const commentsResult = useQuery(adminCommentsQuery({ page: 1, pageSize: 5, search: '', movieId: '' }));
  const movies = moviesResult.data ?? [];
  const users = usersResult.data ?? [];
  const comments = commentsResult.data?.items ?? [];
  const visibleTitles = movies.filter((movie) => movie.type !== 'Episode');
  const counts = {
    Movie: visibleTitles.filter((movie) => movie.type === 'Movie').length,
    Series: visibleTitles.filter((movie) => movie.isSeries).length,
    Cartoon: visibleTitles.filter((movie) => movie.type === 'Cartoon').length
  };
  const maximum = Math.max(1, counts.Movie, counts.Series, counts.Cartoon);
  const recent = [...visibleTitles].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 5);
  const premium = users.filter((user) => user.subscription?.hasFullAccess).length;
  const localized = visibleTitles.filter((movie) => movie.titleTm && movie.titleEn && movie.titleRu).length;

  return <div className="admin-dashboard">
    <section className="dashboard-hero">
      <div><span className="admin-section-kicker">Dilewar operations</span><h2>Everything important, at a glance.</h2><p>Track catalog readiness, community activity and member access from one focused workspace.</p></div>
      <div className="dashboard-quick-actions"><Link className="primary" to="/movies/new"><Plus size={17} /> Add title</Link><Link to="/users/new"><Users size={17} /> Add user</Link></div>
    </section>

    <section className="dashboard-metrics" aria-label="Platform overview">
      <DashboardMetric icon={Film} label="Catalog titles" value={visibleTitles.length} detail={`${movies.filter((movie) => movie.fileStatus?.video).length} playback ready`} tone="cyan" />
      <DashboardMetric icon={Users} label="Registered users" value={users.length} detail={`${premium} premium members`} tone="violet" />
      <DashboardMetric icon={MessageSquareText} label="Comments" value={commentsResult.data?.total ?? 0} detail="Community conversations" tone="amber" />
      <DashboardMetric icon={Languages} label="Localized" value={localized} detail={`of ${visibleTitles.length} titles`} tone="green" />
    </section>

    <div className="dashboard-grid">
      <section className="dashboard-panel dashboard-content-mix">
        <DashboardPanelHead kicker="Catalog" title="Content distribution" link="/films" />
        <div className="dashboard-bars">
          <ContentBar icon={Film} label="Films" value={counts.Movie} maximum={maximum} tone="cyan" />
          <ContentBar icon={MonitorPlay} label="Serials" value={counts.Series} maximum={maximum} tone="violet" />
          <ContentBar icon={Clapperboard} label="Cartoons" value={counts.Cartoon} maximum={maximum} tone="amber" />
        </div>
        <div className="dashboard-membership"><span><Crown size={17} /></span><div><strong>{premium} premium members</strong><small>{users.length ? Math.round((premium / users.length) * 100) : 0}% of registered accounts have full access</small></div></div>
      </section>

      <section className="dashboard-panel dashboard-activity">
        <DashboardPanelHead kicker="Community" title="Recent activity" link="/comments" />
        <div className="dashboard-activity-list">
          {comments.length ? comments.map((comment) => { const movie = movies.find((item) => item.id === comment.movieId); return <Link to={movie ? movieDetailPath(movie) : `/movies/${comment.movieId}`} key={comment.id}><span>{comment.username?.slice(0,1).toUpperCase() || '?'}</span><div><strong>{comment.username}</strong><p>{comment.body}</p><small>{comment.movieTitle} · {new Date(comment.createdAt).toLocaleDateString()}</small></div></Link>; }) : <div className="dashboard-empty"><Activity size={22} /><span>No recent comments</span></div>}
        </div>
      </section>

      <section className="dashboard-panel dashboard-recent">
        <DashboardPanelHead kicker="Library" title="Recently added" link="/films" />
        <div className="dashboard-recent-list">
          {recent.map((movie) => <Link to={movieDetailPath(movie)} key={movie.id}>
            <span className="dashboard-poster" style={movie.coverUrl ? undefined : { background: moviePosterFallback(movie) }}>{movie.coverUrl ? <img src={movie.coverUrl} alt="" /> : null}</span>
            <div><strong>{movie.titleEn || movie.title}</strong><small>{movie.type} · {movie.year || 'Year unknown'}</small></div>
            <span className={movie.fileStatus?.video ? 'ready' : 'pending'}>{movie.fileStatus?.video ? 'Ready' : 'Metadata'}</span><ArrowUpRight size={16} />
          </Link>)}
          {!recent.length ? <div className="dashboard-empty"><Film size={22} /><span>No titles yet</span></div> : null}
        </div>
      </section>
    </div>
  </div>;
}

function DashboardMetric({ icon: Icon, label, value, detail, tone }) {
  return <article className={`dashboard-metric ${tone}`}><span><Icon size={20} /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function DashboardPanelHead({ kicker, title, link }) {
  return <div className="dashboard-panel-head"><div><span>{kicker}</span><h3>{title}</h3></div><Link to={link}>View all <ArrowUpRight size={14} /></Link></div>;
}

function ContentBar({ icon: Icon, label, value, maximum, tone }) {
  return <div className={`dashboard-bar ${tone}`}><span><Icon size={16} />{label}</span><div><i style={{ width: `${(value / maximum) * 100}%` }} /></div><strong>{value}</strong></div>;
}
