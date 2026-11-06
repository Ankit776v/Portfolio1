import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../account-context.jsx';
import { tmdbFetch } from '../tmdb.js';
import WatchLink from './watch-link.jsx';

function getLocalWatchLinks(episode) {
  const source = episode?.links ?? episode?.link;
  const values = Array.isArray(source)
    ? source.map(entry => typeof entry === 'string' ? entry : entry?.link || entry?.url)
    : typeof source === 'string'
      ? [source]
      : source && typeof source === 'object'
        ? Object.values(source).map(entry => typeof entry === 'string' ? entry : entry?.link || entry?.url)
        : [];
  return values.filter(value => {
    if (typeof value !== 'string') return false;
    try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
  });
}

function SeasonEpisodes({ seriesId, season, localSeason, localIndex }) {
  const { account } = useAccount();
  const language = account?.preferences.language || 'en-US';
  const [stored, setStored] = useState(null);
  const [revision, setRevision] = useState(0);
  const number = season.number;
  const scope = `${seriesId}:${number}:${language}:${revision}`;
  const current = stored?.scope === scope ? stored : null;
  useEffect(() => {
    const controller = new AbortController();
    tmdbFetch(`https://api.themoviedb.org/3/tv/${seriesId}/season/${number}?language=${encodeURIComponent(language)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.episodes)) throw new Error(data.message || 'Episodes could not be loaded.');
        return data;
      })
      .then(data => { if (!controller.signal.aborted) setStored({ scope, data }); })
      .catch(error => { if (!controller.signal.aborted) setStored({ scope, error: error.message }); });
    return () => controller.abort();
  }, [seriesId, number, language, scope]);

  return <div className="season-episodes" aria-busy={!current}>
    {!current ? <p role="status">Loading {season.label.toLowerCase()} episodes...</p>
      : current.error ? <p role="alert">{current.error} <button type="button" onClick={() => setRevision(value => value + 1)}>Retry</button></p>
      : current.data.episodes.length === 0 ? <p>No episodes announced for this season yet.</p>
      : <div className="season-episode-list">{current.data.episodes.map(episode => {
        const remote = `/title/tv/${seriesId}/season/${number}/episode/${episode.episode_number}`;
        const hasLocal = localIndex != null && localIndex !== '' && Number.isInteger(Number(localIndex)) && Number(localIndex) >= 0;
        const to = hasLocal && number > 0 ? `/movie/${localIndex}/episode/${episode.episode_number}?season=${number}` : remote;
        const localEpisode = localSeason?.episodes?.find(item => Number(item.episode ?? item.episode_number) === Number(episode.episode_number));
        const watchLinks = getLocalWatchLinks(localEpisode);
        const date = episode.air_date ? new Date(`${episode.air_date}T00:00:00Z`) : null;
        const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Release date to be announced';
        return <div className="season-episode-row" key={episode.id ?? episode.episode_number}>
          <Link className="season-episode-link" to={to}>
            <article className="season-episode">
              <div className="season-episode-image">
                {episode.still_path ? <img loading="lazy" src={`https://image.tmdb.org/t/p/w342${episode.still_path}`} alt="" /> : <span className="episode-image-placeholder">Episode {episode.episode_number}</span>}
                <span className="season-episode-play" aria-hidden="true">&#9654;</span>
              </div>
              <div className="season-episode-copy">
                <h3>{episode.name || `Episode ${episode.episode_number}`}</h3>
                <p className="season-episode-meta">S{season.display} E{episode.episode_number} &middot; {dateLabel}{episode.runtime > 0 && <> &middot; {episode.runtime}m</>}</p>
                <p className="season-episode-overview">{episode.overview || 'An overview is not available yet.'}</p>
              </div>
            </article>
          </Link>
          {watchLinks.length > 0 && <div className="watch-links watch-links-content season-episode-watch-links">{watchLinks.map((url, index) => <WatchLink key={`${url}:${index}`} url={url} title={episode.name || `Episode ${episode.episode_number}`} label={index === 0 ? 'Watch Now' : `Watch option ${index + 1}`} />)}</div>}
        </div>;
      })}</div>}
  </div>;
}

export default function SeriesSeasons({ seriesId, seasons = [], localSeasons = [], localIndex }) {
  const id = useId();
  const [selection, setSelection] = useState(null);
  const normalized = [];
  const seen = new Set();
  for (const season of seasons) {
    const raw = season.seasonid ?? season.season_number ?? season.season;
    if (raw == null || raw === '') continue;
    const number = Number(raw);
    if (!Number.isInteger(number) || number < 0 || seen.has(number)) continue;
    seen.add(number);
    const display = Number(season.season ?? number);
    const localSeason = localSeasons.find(item => Number(item.seasonid ?? item.season_number ?? item.season) === number);
    normalized.push({ ...season, localEpisodes: localSeason?.episodes || season.episodes || [], number, display, label: number === 0 ? 'Specials' : `Season ${display}` });
  }
  normalized.sort((a, b) => (a.number === 0) - (b.number === 0) || a.display - b.display);
  const selected = selection?.seriesId === seriesId ? normalized.find(season => season.number === selection.number) || normalized[0] : normalized[0];
  if (!Number.isSafeInteger(Number(seriesId)) || Number(seriesId) <= 0) return null;
  if (!selected) return <section className="movie-section"><h2>Seasons &amp; episodes</h2><p>No seasons have been announced yet.</p></section>;

  function moveFocus(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
  }
  return <section className="season-browser" aria-label="Seasons and episodes">
    <div className="season-tabs" role="tablist" aria-label="Select season" onKeyDown={moveFocus}>
      {normalized.map(season => <button type="button" role="tab" key={season.number} id={`${id}-tab-${season.number}`} aria-controls={`${id}-panel`} aria-selected={selected.number === season.number} tabIndex={selected.number === season.number ? 0 : -1} onClick={() => setSelection({ seriesId, number: season.number })}>{season.label}</button>)}
    </div>
    <div className="season-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected.number}`} tabIndex={0}>
      <SeasonEpisodes key={`${seriesId}:${selected.number}`} seriesId={seriesId} season={selected} localSeason={{ episodes: selected.localEpisodes }} localIndex={localIndex} />
    </div>
  </section>;
}
