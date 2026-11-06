import { tmdbFetch } from '../tmdb.js';
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import mList from "./mlist.jsx";

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

function creditDate(credit) { return credit.release_date || credit.first_air_date || ""; }
function titleKey(title) { return String(title || "").replace(/\s*\(\d{4}\)\s*/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); }
function isShow(item) { return ["tv", "show", "shows", "series", "anime"].includes(String(item.categories ?? item.catergories ?? "").toLowerCase()); }
function findLocalMovieIndex(credit) {
  const title = titleKey(credit.title || credit.name), year = creditDate(credit).slice(0, 4), show = credit.media_type === "tv";
  const sameTitle = (item) => titleKey(item.title1 || item.title) === title && isShow(item) === show;
  const sameYear = (item) => (item.title1 || item.title || "").match(/\((\d{4})\)/)?.[1] === year;
  let index = mList.findIndex((item) => sameTitle(item) && (!year || sameYear(item)));
  return index === -1 ? mList.findIndex(sameTitle) : index;
}
function roleForCredit(credit) {
  const job = String(credit.job || "").trim();
  if (/^director$/i.test(job)) return "Director";
  if (/(writer|screenplay|story|dialogue|author|novel|characters)/i.test(job)) return "Writer";
  if (/producer/i.test(job)) return "Producer";
  return job || credit.department || "Crew";
}
function FilmographyGrid({ credits }) {
  return <div className="filmography-grid">{credits.map((credit) => {
    const title = credit.title || credit.name, year = creditDate(credit).slice(0, 4), index = findLocalMovieIndex(credit);
    const content = <>{credit.poster_path ? <img src={`${TMDB_IMAGE_BASE_URL}/w342${credit.poster_path}`} alt={`${title} poster`} /> : <div className="filmography-placeholder">No poster available</div>}<div className="filmography-info"><span>{credit.media_type === "tv" ? "TV" : "Movie"}{year ? ` · ${year}` : ""}</span><h3>{title}</h3><p>{credit.job || credit.department || "Crew"}</p></div></>;
    const key = `${credit.media_type}-${credit.id}-${credit.job}`;
    return index >= 0 ? <Link className="filmography-card" to={`/movie/${index}`} key={key}>{content}</Link> : <article className="filmography-card filmography-unavailable" key={key}>{content}<span>Not available in Movieshub</span></article>;
  })}</div>;
}

export default function Crew() {
  const { crewid } = useParams();
  const [person, setPerson] = useState(null), [credits, setCredits] = useState([]), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    async function loadCrew() {
      setLoading(true); setError(""); setPerson(null); setCredits([]);
      try {
        const [personResponse, creditsResponse] = await Promise.all([tmdbFetch(`https://api.themoviedb.org/3/person/${crewid}`, { signal: controller.signal }), tmdbFetch(`https://api.themoviedb.org/3/person/${crewid}/combined_credits`, { signal: controller.signal })]);
        if (!personResponse.ok || !creditsResponse.ok) throw new Error("Crew details could not be loaded.");
        const [personData, creditsData] = await Promise.all([personResponse.json(), creditsResponse.json()]);
        if (!controller.signal.aborted) { setPerson(personData); setCredits((creditsData.crew || []).filter((credit) => credit.title || credit.name)); }
      } catch (err) { if (err.name !== "AbortError") setError(err.message || "Crew details could not be loaded."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    loadCrew(); return () => controller.abort();
  }, [crewid]);
  const roleGroups = useMemo(() => {
    const groups = new Map();
    credits.forEach((credit) => { const role = roleForCredit(credit), group = groups.get(role) || new Map(), key = `${credit.media_type}-${credit.id}`; if (!group.has(key)) group.set(key, credit); groups.set(role, group); });
    const order = ["Director", "Writer", "Producer"];
    return [...groups.entries()].map(([role, group]) => [role, [...group.values()].sort((a, b) => creditDate(b).localeCompare(creditDate(a)))]).sort(([a], [b]) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)) || a.localeCompare(b));
  }, [credits]);
  if (loading) return <main className="actor-page"><p className="tmdb-status">Loading crew details…</p></main>;
  if (error || !person) return <main className="actor-page movie-not-found"><h1>Crew member not found</h1><p>{error || "This person is unavailable."}</p><Link to="/">Return to home</Link></main>;
  const profileImage = person.profile_path ? `${TMDB_IMAGE_BASE_URL}/w500${person.profile_path}` : null;
  return <main className="actor-page"><Link className="back-link" to={-1}>← Back</Link><section className="actor-profile"><div className="actor-profile-image">{profileImage ? <img src={profileImage} alt={person.name} /> : <div className="actor-image-placeholder">No photo available</div>}</div><div className="actor-profile-details"><p className="movie-category">{person.known_for_department || "Crew"}</p><h1>{person.name}</h1><dl className="actor-facts">{person.birthday && <><dt>Born</dt><dd>{person.birthday}</dd></>}{person.place_of_birth && <><dt>Place of birth</dt><dd>{person.place_of_birth}</dd></>}{person.deathday && <><dt>Died</dt><dd>{person.deathday}</dd></>}</dl><p className="actor-biography">{person.biography || "No biography is available yet."}</p></div></section>{roleGroups.length ? roleGroups.map(([role, roleCredits]) => <section className="actor-filmography" key={role}><h2>As {role}</h2><FilmographyGrid credits={roleCredits} /></section>) : <section className="actor-filmography"><p className="empty-state">No crew credits are available.</p></section>}</main>;
}