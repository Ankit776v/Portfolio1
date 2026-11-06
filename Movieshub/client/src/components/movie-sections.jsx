import { catalogueGroups as groups } from '../catalogue-sections.js';
import mlist from './mlist.jsx';
import { catalogueLink } from '../catalogue-link.js';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useAccount } from '../account-context.jsx';
import PosterImage from './poster-image.jsx';
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.BASE_URL.replace(/\/$/, '');
export function MovieRow({ kind, label, movies = [], mediaType, children }) {
  const rowRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const rowId = `movie-row-${kind}`;

  useEffect(() => {
    const row = rowRef.current;
    const update = () => {
      const left = row.scrollLeft > 1;
      const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
      setEdges(current => current.left === left && current.right === right ? current : { left, right });
    };
    const observer = new ResizeObserver(update);
    observer.observe(row);
    for (const card of row.children) observer.observe(card);
    row.addEventListener('scroll', update, { passive: true });
    const frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      row.removeEventListener('scroll', update);
    };
  }, []);

  function scroll(direction) {
    const row = rowRef.current;
    row.scrollBy({
      left: direction * Math.max(198, row.clientWidth * 0.8),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  return <div className="movie-row-controls">
    <button type="button" className="movie-row-arrow" aria-label={`Scroll ${label} left`} aria-controls={rowId} disabled={!edges.left} onClick={() => scroll(-1)}>❮</button>
    <div ref={rowRef} id={rowId} className="live-movie-row" role="region" aria-label={label} tabIndex={0} onKeyDown={event => {
      if (event.target === event.currentTarget && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        scroll(event.key === 'ArrowLeft' ? -1 : 1);
      }
    }}>
      {children ?? movies.map(movie => <Link key={movie.id} to={catalogueLink(movie, mlist, mediaType)}><article className="card"><PosterImage alt={movie.title || movie.name} src={movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : ''} /><span>{movie.title || movie.name}</span><small>{movie.release_date || movie.first_air_date || 'Release date to be announced'} · ★ {Number(movie.vote_average || 0).toFixed(1)}</small></article></Link>)}
    </div>
    <button type="button" className="movie-row-arrow" aria-label={`Scroll ${label} right`} aria-controls={rowId} disabled={!edges.right} onClick={() => scroll(1)}>❯</button>
  </div>;
}

export default function MovieSections({ category = 'all' }) {
  const { user } = useAuth();
  const { profile, account } = useAccount();
  const [storedRecords,setRecords] = useState({}), [storedErrors,setErrors] = useState({}), [revision,setRevision] = useState(0);
  const profileId = profile?.id || '', language = account?.preferences.language || 'en-US', kids = profile?.kids || false;
  const scope = `${category}:${revision}:${profileId}:${language}:${kids}:${user?.id || ''}`;
  const records = Object.fromEntries(Object.entries(storedRecords).filter(([,r]) => r.scope === scope));
  const errors = Object.fromEntries(Object.entries(storedErrors).filter(([,r]) => r.scope === scope).map(([k,r]) => [k,r.message]));
  useEffect(() => {
    const controller = new AbortController();
    for (const [kind] of groups.filter(group => category === 'all' || group.category === category).flatMap(group => group.sections)) {
      fetch(`${API_URL}/api/catalogue/${kind}${profileId ? `?profile=${encodeURIComponent(profileId)}` : ''}`, { signal: controller.signal, credentials: 'include' })
        .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.message || 'Unable to load movies.'); return data; })
        .then(data => { if (!controller.signal.aborted) setRecords(current => ({ ...current,[kind]:{ ...data,scope } })); })
        .catch(e => { if (!controller.signal.aborted) setErrors(current => ({ ...current,[kind]: { scope,message:e.message } })); });
    }
    return () => controller.abort();
  }, [scope, category, profileId, user]);
  useEffect(() => {
    // Frequent checks also catch midnight and tabs returning after a long sleep.
    let lastDay = new Intl.DateTimeFormat('en-CA',{ timeZone:'Asia/Kolkata' }).format(new Date());
    let lastRefresh = Date.now();
    function check() { const today = new Intl.DateTimeFormat('en-CA',{ timeZone:'Asia/Kolkata' }).format(new Date()); if (today !== lastDay || Date.now() - lastRefresh >= 3600000) { lastDay = today; lastRefresh = Date.now(); setRevision(v => v+1); } }
    const timer = setInterval(check,30000);
    document.addEventListener('visibilitychange',check); window.addEventListener('focus',check);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange',check); window.removeEventListener('focus',check); };
  }, []);
  const visibleGroups = groups.filter(group => category === 'all' || group.category === category);
  return <div className="live-sections">
    {/* <p>Live listings <button onClick={() => setRevision(v => v+1)}>Refresh</button></p> */}
    {visibleGroups.map(group => <div className="catalogue-group" key={group.category}>
      <h2 className="catalogue-group-heading">{group.label}</h2>
      {group.type === 'tv' && <p>Upcoming series premiere within the next 180 days.</p>}
      {group.sections.map(([kind,label]) => <section className="movie-section" key={kind}>
        <div className="section-heading"><h3>{label}</h3><Link className="see-all-link" to={`/browse/${kind}`}>See all →</Link></div>
        {errors[kind] ? <p role="alert">{errors[kind]} <button onClick={() => setRevision(v => v+1)}>Retry</button></p> : !records[kind] ? <p role="status">Loading titles...</p> : <>
          <MovieRow key={`${scope}:${kind}`} kind={kind} label={label} movies={records[kind].results} mediaType={group.type} />
          {!records[kind].results.length && <p>No {group.type === 'tv' ? 'series' : 'movies'} available for this section{kids ? ' with the family filter' : ''}.</p>}
        </>}
      </section>)}
    </div>)}
  </div>;
}
