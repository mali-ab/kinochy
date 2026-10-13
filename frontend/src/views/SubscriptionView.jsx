'use client';

import { Check, Crown, PlayCircle } from 'lucide-react';
import { useViewer } from '../api/hooks.jsx';

export default function SubscriptionView() {
  const user = useViewer();
  const premium = Boolean(user?.subscription?.hasFullAccess);

  return (
    <section className="subscription-page">
      <div className="subscription-hero"><span><Crown size={22} /> Kinochy Premium</span><h1>Learn without interruptions</h1><p>Watch complete movies, switch between every available quality, and learn with interactive subtitles.</p></div>
      <div className="subscription-plans">
        <article className={!premium ? 'current' : ''}>
          <PlayCircle size={28} /><h2>Free</h2><strong>$0</strong><p>Explore every movie before subscribing.</p>
          <ul><li><Check size={16} /> First 10 minutes of every movie</li><li><Check size={16} /> Interactive subtitles</li><li><Check size={16} /> Vocabulary tools</li></ul>
          {!premium ? <span className="current-plan">Current plan</span> : null}
        </article>
        <article className={`premium ${premium ? 'current' : ''}`}>
          <Crown size={28} /><h2>Premium</h2><strong>Full access</strong><p>Continue every story without a viewing limit.</p>
          <ul><li><Check size={16} /> Complete movies and series</li><li><Check size={16} /> 720p, 480p and 360p quality</li><li><Check size={16} /> All learning features</li></ul>
          {premium ? <span className="current-plan">Active{user.subscription.expiresAt ? ` until ${new Date(user.subscription.expiresAt).toLocaleDateString()}` : ''}</span> : <p className="subscription-contact">Ask an administrator to activate Premium for your account.</p>}
        </article>
      </div>
    </section>
  );
}
