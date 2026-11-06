import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../account-context.jsx';
import { catalogueLink } from '../catalogue-link.js';
import mlist from './mlist.jsx';
import fallback from '../Images/background.png';

const API = import.meta.env.VITE_API_URL || import.meta.env.BASE_URL.replace(/\/$/, '');

export default function FeaturedHero() {
  const { profile, account } = useAccount();
  const [record, setRecord] = useState(null);
  const profileId = profile?.id || '';
  const language = account?.preferences.language || 'en-US';
  const scope = `${profileId}:${language}:${Boolean(profile?.kids)}`;
  const title = record?.scope === scope ? record.title : null;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/api/catalogue/popular${profileId ? `?profile=${encodeURIComponent(profileId)}` : ''}`, { signal: controller.signal, credentials: 'include' })
      .then(async response => { if (!response.ok) return null; return response.json(); })
      .then(data => {
        const featured = data?.results?.find(item => item.backdrop_path && item.overview);
        if (!controller.signal.aborted) setRecord({ scope, title: featured || null });
      }).catch(() => {});
    return () => controller.abort();
  }, [scope, profileId]);
  const image = title?.backdrop_path ? `https://image.tmdb.org/t/p/original${title.backdrop_path}` : fallback;
  return <section className="featured-hero" aria-labelledby="featured-title">
    <img key={image} className="featured-backdrop" src={image} alt="" fetchPriority="high" onError={event => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = 'true'; event.currentTarget.src = fallback; } }} />
    <div className="featured-copy">
      <p className="featured-eyebrow"><span>M</span> {title ? 'IN THE SPOTLIGHT' : 'A WORLD OF STORIES'}</p>
      <h1 id="featured-title">{title?.title || title?.name || 'Your next great story.'}</h1>
      <div className="featured-meta">
        {title?.vote_average > 0 && <span className="featured-rating">&#9733; {Number(title.vote_average).toFixed(1)} TMDB</span>}
        {title?.release_date && <span>{title.release_date.slice(0, 4)}</span>}
        <span className="featured-quality">HD</span><span>{profile?.kids ? 'Family discovery' : 'Movies. Series. More.'}</span>
      </div>
      <p className="featured-description">{title?.overview || 'Discover something worth watching. Explore standout films, find your next favourite series, and keep the stories you love in one place.'}</p>
      <div className="featured-actions">
        <Link className="featured-play" to={title ? catalogueLink(title, mlist, 'movie') : '/recent'}><span aria-hidden="true">&#9654;</span> {title ? 'Explore title' : 'Explore movies'}</Link>
        <Link className="featured-more" to="/my-list"><span aria-hidden="true">＋</span> My List</Link>
      </div>
      <p className="featured-caption">YOUR SEAT. YOUR STORIES.</p>
    </div>
    <div className="featured-side" aria-hidden="true"><span className="brand-movies">Movies</span><span className="brand-hub">Hub</span></div>
  </section>;
}
