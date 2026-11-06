import { tmdbFetch } from '../tmdb.js';
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import mList from "./mlist";

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

function creditDate(credit) {
  return credit.release_date || credit.first_air_date || "";
}

function isUpcomingCredit(credit) {
  const date = creditDate(credit);

  // No release/air date → treat as upcoming
  if (!date) return true;

  // Future release/air date → upcoming
  return date > new Date().toISOString().slice(0, 10);
}

function titleKey(title) {
  return String(title || "")
    .replace(/\s*\(\d{4}\)\s*/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isShow(item) {
  return ["tv", "show", "shows", "series", "anime"].includes(String(item.categories || "").toLowerCase());
}

function findLocalMovieIndex(credit) {
  const creditIsShow = credit.media_type === "tv";
  const creditTitle = titleKey(credit.title || credit.name);
  const creditYear = creditDate(credit).slice(0, 4);
  const sameTitleAndType = (item) => titleKey(item.title1 || item.title) === creditTitle && isShow(item) === creditIsShow;
  const sameYear = (item) => (item.title1 || item.title || "").match(/\((\d{4})\)/)?.[1] === creditYear;

  let index = mList.findIndex((item) => sameTitleAndType(item) && (!creditYear || sameYear(item)));
  if (index === -1) index = mList.findIndex(sameTitleAndType);
  if (index === -1 && creditTitle.length > 3) {
    index = mList.findIndex((item) => {
      const localTitle = titleKey(item.title1 || item.title);
      return isShow(item) === creditIsShow
        && (!creditYear || sameYear(item))
        && localTitle.length > 3
        && (localTitle.includes(creditTitle) || creditTitle.includes(localTitle));
    });
  }
  return index;
}

function FilmographyGrid({ credits }) {
  return <div className="filmography-grid">
    {credits.map((credit) => {
      const title = credit.title || credit.name;
      const year = creditDate(credit).slice(0, 4);
      const movieIndex = findLocalMovieIndex(credit);
      const poster = credit.poster_path ? `${TMDB_IMAGE_BASE_URL}/w342${credit.poster_path}` : null;
      const card = <>
        {poster ? <img src={poster} alt={`${title} poster`} /> : <div className="filmography-placeholder">No poster available</div>}
        {/* <div className="filmography-info"><span>{credit.media_type === "tv" ? "TV" : "Movie"}{year ? ` · ${year}` : ""}</span><h3>{title}</h3>{credit.character && <p>as {credit.character}</p>}</div> */}
        <div className="filmography-info"><span>{credit.media_type === "tv" ? "TV" : "Movie"}{year ? ` · ${credit.release_date}` : ""}</span><h3>{title}</h3>{credit.character && <p>as {credit.character}</p>}</div>
      </>;

      return movieIndex >= 0
        ? <Link className="filmography-card" to={`/movie/${movieIndex}`} key={`${credit.media_type}-${credit.id}`}>{card}</Link>
        : <article className="filmography-card filmography-unavailable" key={`${credit.media_type}-${credit.id}`}>{card}<span>Not available in Movieshub</span></article>;
    })}
  </div>;
}

export default function Actor() {
  const { actorid } = useParams();
  const [person, setPerson] = useState(null);
  const [credits, setCredits] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const upcomingCredits = credits.filter(isUpcomingCredit);
  const pastCredits = credits.filter((credit) => !isUpcomingCredit(credit));

  useEffect(() => {
    const controller = new AbortController();

    async function loadActor() {
      setLoading(true);
      setError("");
      setPerson(null);
      setCredits([]);

      try {
        const [personResponse, creditsResponse] = await Promise.all([
          tmdbFetch(`https://api.themoviedb.org/3/person/${actorid}`, { signal: controller.signal }),
          tmdbFetch(`https://api.themoviedb.org/3/person/${actorid}/combined_credits`, { signal: controller.signal }),
        ]);

        if (!personResponse.ok || !creditsResponse.ok) throw new Error("Actor details could not be loaded.");

        const [personData, creditsData] = await Promise.all([personResponse.json(), creditsResponse.json()]);
        if (controller.signal.aborted) return;

        setPerson(personData);
        const actingCredits = (creditsData.cast || [])
          .filter((credit) => credit.title || credit.name)
          .sort((a, b) => creditDate(b).localeCompare(creditDate(a)));

        setCredits(actingCredits);
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message || "Actor details could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadActor();
    return () => controller.abort();
  }, [actorid]);

  if (loading) return <main className="actor-page"><p className="tmdb-status">Loading actor details…</p></main>;

  if (error || !person) {
    return <main className="actor-page movie-not-found"><h1>Actor not found</h1><p>{error || "This actor is unavailable."}</p><Link to="/">Return to home</Link></main>;
  }

  const profileImage = person.profile_path ? `${TMDB_IMAGE_BASE_URL}/w500${person.profile_path}` : null;

  return (
    <main className="actor-page">
      <Link className="back-link" to={-1}>← Back</Link>
      <section className="actor-profile">
        <div className="actor-profile-image">
          {profileImage ? <img src={profileImage} alt={person.name} /> : <div className="actor-image-placeholder">No photo available</div>}
        </div>
        <div className="actor-profile-details">
          <p className="movie-category">{person.known_for_department || "Person"}</p>
          <h1>{person.name}</h1>
          <dl className="actor-facts">
            {person.birthday && <><dt>Born</dt><dd>{person.birthday}</dd></>}
            {person.place_of_birth && <><dt>Place of birth</dt><dd>{person.place_of_birth}</dd></>}
            {person.deathday && <><dt>Died</dt><dd>{person.deathday}</dd></>}
          </dl>
          <p className="actor-biography">{person.biography || "No biography is available yet."}</p>
        </div>
      </section>

      <section className="actor-filmography">
        <h2>Filmography</h2>

        {pastCredits.length ? (
          <FilmographyGrid credits={pastCredits} />
        ) : (
          <p className="empty-state">No acting credits are available.</p>
        )}
      </section>

      {upcomingCredits.length > 0 && (
        <section className="actor-filmography">
          <h2>Upcoming</h2>
          <FilmographyGrid credits={upcomingCredits} />
        </section>
      )}
    </main>
  );
}
