import CatalogueFilters from './catalogue-filters.jsx';
import { filterKeys } from '../catalogue-filters.js';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useAccount } from '../account-context.jsx';
import { catalogueGroups } from '../catalogue-sections.js';
import { catalogueLink } from '../catalogue-link.js';
import mlist from './mlist.jsx';
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.BASE_URL.replace(/\/$/, '');

export default function BrowseSection({ kindOverride } = {}) {
  const { kind: routeKind } = useParams();
  const kind = kindOverride || routeKind;
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { account, profile } = useAccount();
  const [stored, setStored] = useState(null);
  const [revision, setRevision] = useState(0);
  const discovery = kind === 'discover-movies' || kind === 'series-discover';
  const group = discovery ? (kind === 'discover-movies' ? { category:'movies', type:'movie', label:'Movies', sections:[[kind,'Discover Movies']] } : { category:'shows', type:'tv', label:'Series & Shows', sections:[[kind,'Discover Series']] }) : catalogueGroups.find(g => g.sections.some(([id]) => id === kind));
  const label = group?.sections.find(([id]) => id === kind)?.[1];
  const page = Number(params.get('page') || 1);
  const valid = Boolean(group) && Number.isInteger(page) && page >= 1 && page <= 334;
  const profileId = profile?.id || '';
  const filterQuery = new URLSearchParams(filterKeys.flatMap(key => params.get(key) ? [[key,params.get(key)]] : [])).toString();
  const scope = `${filterQuery}:${kind}:${page}:${revision}:${user?.id || ''}:${profileId}:${profile?.kids}:${account?.preferences.language}`;
  const current = stored?.scope === scope ? stored : null;

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    const query = new URLSearchParams(filterQuery);
    query.set('page', String(page));
    if (profileId) query.set('profile', profileId);
    fetch(`${API_URL}/api/catalogue/${kind}?${query}`, { signal: controller.signal, credentials: 'include' })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Unable to load titles.'); return data; })
      .then(data => { if (!controller.signal.aborted) setStored({ scope, data }); })
      .catch(error => { if (!controller.signal.aborted) setStored({ scope, error: error.message }); });
    return () => controller.abort();
  }, [scope, valid, kind, page, profileId, user, filterQuery]);

  useEffect(() => {
    const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    let lastDay = day(), lastRefresh = Date.now();
    const check = () => { if (lastDay !== day() || Date.now() - lastRefresh >= 3600000) { lastDay = day(); lastRefresh = Date.now(); setRevision(v => v + 1); } };
    const timer = setInterval(check, 30000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, []);

  function go(nextPage) {
    const query = new URLSearchParams(params);
    if (nextPage === 1) query.delete('page'); else query.set('page', String(nextPage));
    setParams(query);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (!valid) return <main className="HomeMovie"><h1>Section or page not found</h1><Link to="/">Back to home</Link></main>;
  const data = current?.data;
  const sorting = ({popular:'Most popular first',rating:'Highest rated first',newest:'Newest first',oldest:'Oldest first'})[params.get('sort')] || (kind.includes('top-rated') ? 'Highest rated first' : 'Most popular first');
  return <main className="HomeMovie browse-section">
    <Link className="back-link" to={discovery ? "/" : `/?cat=${group.category}`}>Back to {discovery ? "home" : group.label}</Link> <Link className="see-all-link" to={`/recent?cat=${group.category}`}>Browse curated collection</Link>
    <div className="section-heading"><h1>{label}</h1>
    {/* <button onClick={() => setRevision(v => v + 1)}>Refresh</button> */}
    </div>
    <p>{sorting}{kind === 'now-playing' ? (filterQuery ? ' · Theatrical releases in India in the last 60 days' : ' · Currently in theatres in India') : ''}{kind.includes('upcoming') ? ' · Upcoming releases within the next 180 days' : ''}</p>
    <CatalogueFilters type={group.type} />
    {current?.error ? <p role="alert">{current.error} <button onClick={() => setRevision(v => v + 1)}>Retry</button></p> : !data ? <p role="status">Loading titles...</p> : <>
      <div className="cards">{data.results.map(item => <Link key={item.id} to={catalogueLink(item, mlist, group.type)} state={{ returnTo: `${location.pathname}${location.search}` }}><article className="card"><img className="cardimg" alt={item.title || item.name} loading="lazy" src={item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : 'https://placehold.co/342x513?text=No+Poster'} /><span>{item.title || item.name}</span></article></Link>)}</div>
      {!data.results.length && <p>No titles on this page{profile?.kids ? ' with the family filter' : ''}.</p>}
      <nav className="pagination" aria-label={`${label} pages`}>
        <button onClick={() => go(1)} disabled={page === 1}>First</button>
        <button onClick={() => go(page - 1)} disabled={page === 1}>Previous</button>
        <span>Page {page} of {data.totalPages}</span>
        <button onClick={() => go(page + 1)} disabled={page >= data.totalPages}>Next</button>
        <button onClick={() => go(data.totalPages)} disabled={page >= data.totalPages}>Last</button>
        <label>Go to page <input type="number" min="1" max={data.totalPages} placeholder="Page" aria-label="Go to page" onKeyDown={event => { if (event.key === 'Enter') { const next = Number(event.currentTarget.value); if (Number.isInteger(next) && next >= 1 && next <= data.totalPages) { go(next); event.currentTarget.value = ''; } } }} /></label>
      </nav>
    </>}
  </main>;
}
