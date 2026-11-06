import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAccount } from '../account-context.jsx';
import { tmdbFetch } from '../tmdb.js';

export default function RemoteEpisode() {
  const { tmdbId, seasonNumber, episodeNumber } = useParams();
  const { account, profile, loading:accountLoading } = useAccount();
  const language = account?.preferences.language || 'en-US';
  const [stored,setStored] = useState(null), [revision,setRevision] = useState(0);
  const valid = /^\d+$/.test(tmdbId) && Number.isSafeInteger(Number(tmdbId)) && Number(tmdbId)>0 && /^\d+$/.test(seasonNumber) && Number.isSafeInteger(Number(seasonNumber)) && /^\d+$/.test(episodeNumber) && Number.isSafeInteger(Number(episodeNumber)) && Number(episodeNumber)>0;
  const scope = `${tmdbId}:${seasonNumber}:${episodeNumber}:${language}:${revision}`;
  const current = stored?.scope === scope ? stored : null;
  useEffect(()=>{
    if(!valid) return;
    const controller = new AbortController();
    async function load() {
      const urls=[`tv/${tmdbId}`,`tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`];
      const [series,episode] = await Promise.all(urls.map(async resource=>{
        const response=await tmdbFetch(`https://api.themoviedb.org/3/${resource}?language=${language}`,{signal:controller.signal});
        const data=await response.json(); if(!response.ok) throw new Error(response.status===404 ? 'This episode was not found.' : 'Episode details could not be loaded.'); return data;
      }));
      if(!controller.signal.aborted) setStored({scope,series,episode});
    }
    load().catch(error=>{if(!controller.signal.aborted) setStored({scope,error:error.message});});
    return ()=>controller.abort();
  },[valid,tmdbId,seasonNumber,episodeNumber,language,scope]);
  const back=`/title/tv/${tmdbId}`;
  if(!valid) return <main className="account-page"><h1>Episode not found</h1><Link to="/?cat=shows">Browse series</Link></main>;
  if(!current || accountLoading) return <main className="account-page" aria-busy="true"><p role="status">Loading episode...</p></main>;
  if(current.error) return <main className="account-page"><h1>Episode unavailable</h1><p role="alert">{current.error}</p><button onClick={()=>setRevision(value=>value+1)}>Retry</button><p><Link to={back}>Back to series</Link></p></main>;
  const {series,episode}=current;
  if(profile?.kids && (series.adult || !series.genres?.some(genre=>[10751,10762,16].includes(genre.id)))) return <main className="account-page"><h1>Family catalogue</h1><p>This series is outside the family genre filter.</p><Link to="/?cat=shows">Browse series</Link></main>;
  const count=series.seasons?.find(season=>season.season_number===Number(seasonNumber))?.episode_count;
  return <main className="movie-page remote-episode"><Link className="back-link" to={back}>Back to {series.name || 'series'}</Link>
    <section className="movie-section"><p>{series.name} · {Number(seasonNumber)===0 ? 'Specials' : `Season ${seasonNumber}`}</p><h1>Episode {episodeNumber}: {episode.name || 'Title to be announced'}</h1>
      {episode.still_path && <img className="episode-still" src={`https://image.tmdb.org/t/p/w780${episode.still_path}`} alt={episode.name || `Episode ${episodeNumber}`} />}
      <p>{episode.overview || 'An overview is not available yet.'}</p><p>{episode.air_date ? `Air date: ${episode.air_date}` : 'Air date to be announced'}{episode.runtime ? ` · ${episode.runtime} min` : ''}</p>
      {episode.vote_count>0 && <p>TMDB rating: {Number(episode.vote_average).toFixed(1)} / 10</p>}
      <nav className="pagination" aria-label="Episode navigation">{Number(episodeNumber)>1 && <Link to={`/title/tv/${tmdbId}/season/${seasonNumber}/episode/${Number(episodeNumber)-1}`}>Previous episode</Link>}<Link to={back}>All seasons</Link>{Number(episodeNumber)<count && <Link to={`/title/tv/${tmdbId}/season/${seasonNumber}/episode/${Number(episodeNumber)+1}`}>Next episode</Link>}</nav>
    </section>
  </main>;
}
