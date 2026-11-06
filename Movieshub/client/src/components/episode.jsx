import { tmdbFetch } from '../tmdb.js';
import WatchLink from './watch-link.jsx';
import { useEffect, useState, useRef, useCallback, } from "react";
import mlist from "./mlist";
import { Link, useParams, useSearchParams } from "react-router-dom";

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/original";

function getEpisodeWatchLinks(episode) {
    const source = episode?.links ?? episode?.link;
    const values = Array.isArray(source)
        ? source.map(entry => typeof entry === "string" ? entry : entry?.link || entry?.url)
        : typeof source === "string"
            ? [source]
            : source && typeof source === "object"
                ? Object.values(source).map(entry => typeof entry === "string" ? entry : entry?.link || entry?.url)
                : [];
    return values.filter(value => {
        if (typeof value !== "string") return false;
        try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
    });
}

function getSearchEndpoint(category) {
    const normalizedCategory = String(category || "").toLowerCase();

    if (normalizedCategory === "movies" || normalizedCategory === "movie") return "movie";
    if (["tv", "series", "shows", "anime"].includes(normalizedCategory)) return "tv";

    return "multi";
}

export default function Episode() {
    const { movieIndex, episode } = useParams();
    const [searchParams] = useSearchParams();
    const movie = mlist[Number(movieIndex)];
    const seasonNumber = Number(searchParams.get("season"));
    const episodeNo = Number(episode);
    const [tmdbMovie, setTmdbMovie] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [castMembers, setCastMembers] = useState([]);
    const [crewMembers, setCrewMembers] = useState([]);
    const [episodeDetails, setEpisodeDetails] = useState(null);

    const castRef = useRef(null);
    const crewRef = useRef(null);

    const scrollcastLeft = () => {
        castRef.current?.scrollBy({
            left: -500,
            behavior: "smooth",
        });
    };

    const scrollcastRight = () => {
        castRef.current?.scrollBy({
            left: 500,
            behavior: "smooth",
        });
    };

    const scrollcrewLeft = () => {
        crewRef.current?.scrollBy({
            left: -500,
            behavior: "smooth",
        });
    };

    const scrollcrewRight = () => {
        crewRef.current?.scrollBy({
            left: 500,
            behavior: "smooth",
        });
    };

    const cast = useCallback(async (tvId, endpoint, seasonNumber, episodeNumber) => {
        try {
            let url;

            if (endpoint === "tv") {
                url =
                    `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/credits`;
            } else {
                url =
                    `https://api.themoviedb.org/3/${endpoint}/${tvId}/credits`;
            }

            const response = await tmdbFetch(url);

            if (!response.ok) {
                throw new Error(`TMDB credits request failed (${response.status})`);
            }

            const data = await response.json();

            const allCast = [
                ...(data.cast || []),
                ...(data.guest_stars || [])
            ];

            const seen = new Set();

            const uniqueCast = allCast.filter(person => {
                if (!person.profile_path) return false;

                if (seen.has(person.id)) {
                    return false;
                }

                seen.add(person.id);
                return true;
            });

            setCastMembers(uniqueCast.slice(0, 50));

        } catch (err) {
            console.error("Unable to load episode cast:", err);
        }
    }, []);

    const crew = useCallback(async (tvId, endpoint, seasonid) => {
        try {

            let url;

            if (endpoint === "tv" && movie.seasons?.length) {

                url =
                    `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonid}/credits`;

            } else {

                url =
                    `https://api.themoviedb.org/3/${endpoint}/${tvId}/credits`;

            }

            const response = await tmdbFetch(url);
            const data = await response.json();

            setCrewMembers(() => {
                const seen = new Set();

                const departmentOrder = {
                    Production: 1,
                    Directing: 2,
                    Writing: 3,
                    Sound: 4,
                    Camera: 5,
                    Editing: 6,
                    Art: 7,
                    Costume: 8,
                    Makeup: 9,
                    VisualEffects: 10,
                    Lighting: 11,
                    Crew: 12,
                };

                return (data.crew || [])
                    .filter(person => person.profile_path)

                    // Don't show actors in Crew section
                    .filter(person => person.known_for_department !== "Acting")

                    // Remove duplicates only within same department
                    .filter(person => {
                        const key = `${person.name}-${person.known_for_department}`;

                        if (seen.has(key)) return false;

                        seen.add(key);
                        return true;
                    })

                    // Sort by department, then by name
                    .sort((a, b) => {
                        const depA = departmentOrder[a.known_for_department] ?? 999;
                        const depB = departmentOrder[b.known_for_department] ?? 999;

                        if (depA !== depB) return depA - depB;

                        return a.name.localeCompare(b.name);
                    })

                    .slice(0, 30);
            });

        } catch (err) {
            console.error(err);
        }
    }, [movie]);

    useEffect(() => {
        if (!movie) return undefined;

        const controller = new AbortController();

        async function fetchMovieData() {
            const titleWithYear = movie.title1 || movie.title || "";
            const year = titleWithYear.match(/\((\d{4})\)/)?.[1];
            const title = titleWithYear.replace(/\s*\(\d{4}\)\s*/g, "").trim();
            const endpoint = getSearchEndpoint(movie.categories);
            const cacheKey = `poster_${title}_${year}`;
            const params = new URLSearchParams({
                query: title,
            });

            if (year && endpoint === "movie") params.set("year", year);
            if (year && endpoint === "tv") params.set("first_air_date_year", year);

            setIsLoading(true);
            setTmdbMovie(null);

            try {
                const tmdbId = movie.tmdbid ?? movie.tmdbId ?? movie.id;
                if (tmdbId) {
                    const detailEndpoint = endpoint === "tv" ? "tv" : "movie";
                    const response = await tmdbFetch(
                        `https://api.themoviedb.org/3/${detailEndpoint}/${tmdbId}`,
                        { signal: controller.signal }
                    );
                    if (!response.ok) throw new Error(`TMDB request failed (${response.status})`);
                    const data = await response.json();
                    var id = tmdbId;
                    const lastSeasonId = movie.seasons?.at(-1)?.seasonid;

                    cast(id, endpoint, seasonNumber, episodeNo);
                    crew(id, endpoint, lastSeasonId);


                    if (!controller.signal.aborted) setTmdbMovie(data);
                    return;
                }

                let response = await tmdbFetch(
                    `https://api.themoviedb.org/3/search/${endpoint}?${params}`,
                    { signal: controller.signal }
                );
                if (!response.ok) throw new Error(`TMDB request failed (${response.status})`);
                let data = await response.json();

                // A category can be incomplete in the local list, so retry across movie and TV results.
                if (!data.results?.length && endpoint !== "multi") {
                    response = await tmdbFetch(
                        `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(title)}`,
                        { signal: controller.signal }
                    );
                    if (!response.ok) throw new Error(`TMDB request failed (${response.status})`);
                    data = await response.json();
                }

                function similarity(a, b) {

                    a = a.toLowerCase();
                    b = b.toLowerCase();

                    if (a === b)
                        return 100;

                    const aWords = a
                        .replace(/[^\w\s]/g, "")
                        .split(/\s+/);

                    const bWords = b
                        .replace(/[^\w\s]/g, "")
                        .split(/\s+/);

                    let matched = 0;

                    aWords.forEach(word => {

                        if (bWords.includes(word))
                            matched++;

                    });

                    return matched / aWords.length * 100;
                }

                function score(result) {

                    let score = 0;

                    const resultTitle =
                        (
                            result.title ||
                            result.name ||
                            ""
                        ).toLowerCase();

                    const searchTitle =
                        title.toLowerCase();

                    if (resultTitle === searchTitle)
                        score += 1000;

                    score += similarity(searchTitle, resultTitle) * 3;

                    if (resultTitle.startsWith(searchTitle))
                        score += 150;

                    if (resultTitle.includes(searchTitle))
                        score += 75;

                    const resultYear =
                        result.release_date ||
                        result.first_air_date ||
                        "";

                    if (
                        year &&
                        resultYear.startsWith(year)
                    )
                        score += 50;

                    const extraWords =
                        resultTitle.split(/\s+/).length -
                        searchTitle.split(/\s+/).length;

                    if (extraWords > 0)
                        score -= extraWords * 15;

                    console.log('result title ' + resultTitle + ' searchtitle ' + searchTitle + ' score' + score);
                    return score;
                }

                let best = null;

                if (data.results?.length) {

                    best = data.results
                        .map(r => ({
                            ...r,
                            score: score(r)
                        }))
                        .sort((a, b) => b.score - a.score)[0];
                    id = best.id;
                    const seasonid = movie.seasons?.at(-1)?.seasonid;
                    cast(id, endpoint, seasonNumber, episodeNo);
                    crew(id, endpoint, seasonid);

                    if (best?.poster_path) {
                        const poster =
                            `https://image.tmdb.org/t/p/w342${best.poster_path}`;

                        sessionStorage.setItem(cacheKey, poster);
                    }
                }

                if (!controller.signal.aborted) {
                    setTmdbMovie(best);
                }
            } catch (error) {
                if (error?.name !== "AbortError") console.error("Unable to load TMDB data:", error);
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        }

        fetchMovieData();
        return () => controller.abort();
    }, [movie, cast, crew, seasonNumber, episodeNo]);

    useEffect(() => {
        if (!movie || !tmdbMovie?.id || getSearchEndpoint(movie.categories) !== "tv") return;

        const season = Number(searchParams.get("season")) || movie.seasons?.at(-1)?.season;
        if (!season || !episode) return;

        const controller = new AbortController();
        setEpisodeDetails(null);
        tmdbFetch(`https://api.themoviedb.org/3/tv/${tmdbMovie.id}/season/${season}`, { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error(`TMDB request failed (${response.status})`);
                return response.json();
            })
            .then((data) => {
                const selected = data.episodes?.find((item) => item.episode_number === Number(episode));
                if (!controller.signal.aborted) setEpisodeDetails(selected || null);
            })
            .catch((error) => {
                if (error.name !== "AbortError") console.error("Unable to load episode details:", error);
            });

        return () => controller.abort();
    }, [movie, tmdbMovie?.id, episode, searchParams]);


    const backdropUrl = movie.back_poster ? `${TMDB_IMAGE_BASE_URL}${movie.back_poster}` : tmdbMovie?.backdrop_path ? `${TMDB_IMAGE_BASE_URL}${tmdbMovie.backdrop_path}` : null;

    const pageStyle = backdropUrl
        ? {
            backgroundImage: `linear-gradient(rgba(7, 7, 10, 0.6), rgba(7, 7, 10, 0.94)), url("${backdropUrl}")`,
        }
        : {
            background: "transparent",
        };

    if (!movie) {
        return (
            <main className="movie-page movie-not-found">
                <h1>Movie not found</h1>
                <Link to="/">Return to home</Link>
            </main>
        );
    }

    const overview = tmdbMovie?.overview || movie.About;
    const release_date = tmdbMovie?.release_date || movie.Released
    const localSeason = movie.seasons?.find(season => Number(season.seasonid ?? season.season_number ?? season.season) === seasonNumber);
    const localEpisode = localSeason?.episodes?.find(item => Number(item.episode ?? item.episode_number) === episodeNo);
    const episodeWatchLinks = getEpisodeWatchLinks(localEpisode);

    return (
        <div className="episode-page" style={pageStyle}>
            <section className="movie-hero">
                <p className="movie-category">{tmdbMovie?.media_type || movie.categories || "Movie"}</p>
                <div className="head">
                    <div className="episode-head">
                        <h1>{movie.title}</h1>
                        <h2 className="episode-title">{episodeDetails ? `Episode ${episodeDetails.episode_number}: ${episodeDetails.name}` : `Episode ${episode}`}</h2>
                    </div>
                    {episodeWatchLinks.length > 0 && <div className="watch-links watch-links-content" aria-label="Episode watch links">{episodeWatchLinks.map((url, index) => <WatchLink key={`${url}:${index}`} url={url} title={`${movie.title} episode ${episodeNo}`} label={index === 0 ? "Watch Now" : `Watch option ${index + 1}`} />)}</div>}
                </div>
                {episodeDetails?.overview && <p className="movie-about">Episode plot - {episodeDetails.overview}</p>}
                {overview && <p className="movie-about">Plot -{overview}</p>}
                {release_date && <p className="movie-about">Release date -{release_date} </p>}
                {isLoading && <p className="tmdb-status">Loading movie details…</p>}
            </section>
            {castMembers.length > 0 && (
                <section className="movie-section">
                    <h2>Cast</h2>

                    <div className="cast-wrapper">
                        <button
                            className="cast-btn left"
                            onClick={scrollcastLeft}
                        >
                            &#10094;
                        </button>

                        <div className="cast" ref={castRef}>
                            {castMembers.map((actor) => (
                                <Link key={actor.id} to={`/actor/${actor.id}`} >
                                    <div className="actor" key={actor.id}>
                                        <img
                                            src={
                                                actor.profile_path
                                                    ? `https://image.tmdb.org/t/p/w185${actor.profile_path}`
                                                    : "/images/avatar.png"
                                            }
                                            alt={actor.name}
                                        />

                                        <h5>{actor.name}</h5>
                                        <p>{actor.character}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>

                        <button
                            className="cast-btn right"
                            onClick={scrollcastRight}
                        >
                            &#10095;
                        </button>
                    </div>
                </section>
            )}

            {crewMembers.length > 0 && (
                <section className="movie-section">
                    <h2>Crew</h2>

                    <div className="crew-wrapper">
                        <button
                            className="crew-btn left"
                            onClick={scrollcrewLeft}
                        >
                            &#10094;
                        </button>

                        <div className="crew" ref={crewRef}>
                            {crewMembers.map((actor) => (
                                <div className="actor" key={actor.id}>
                                    <img
                                        src={
                                            actor.profile_path
                                                ? `https://image.tmdb.org/t/p/w185${actor.profile_path}`
                                                : "/images/avatar.png"
                                        }
                                        alt={actor.name}
                                    />

                                    <h5>{actor.name}</h5>
                                    <p>{actor.known_for_department}</p>
                                </div>
                            ))}
                        </div>

                        <button
                            className="crew-btn right"
                            onClick={scrollcrewRight}
                        >
                            &#10095;
                        </button>
                    </div>
                </section>
            )}
        </div>
    )
}
