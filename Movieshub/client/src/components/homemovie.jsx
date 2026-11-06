import { tmdbFetch } from '../tmdb.js';
import { lazy, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAccount } from "../account-context.jsx";
import FeaturedHero from "./featured-hero.jsx";
import MovieSections, { MovieRow } from "./movie-sections.jsx";
import PosterImage from "./poster-image.jsx";
import mlist from "./mlist.jsx";
// import { getUniverseTags, matchesUniverse, universes } from "../universes.js";

const BrowseSection = lazy(() => import('./browse-section.jsx'));
const MOVIES_PER_PAGE = 30;
const PLACEHOLDER_POSTER = "https://placehold.co/342x513?text=No+Poster";

const CARD_CACHE_PREFIX = "movieshub:card:v1:";
const CARD_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cardCacheKey(movie) {
    const title = movie.title1 || movie.title || "";
    const category = getMovieCategory(movie);
    const identifier = movie.tmdbid ?? movie.tmdbId ?? movie.id;
    return `${CARD_CACHE_PREFIX}${getSearchEndpoint(category)}:${identifier ?? title}`;
}

function readCardCache(movie) {
    try {
        const cached = JSON.parse(localStorage.getItem(cardCacheKey(movie)) || "null");
        if (!cached || Date.now() - cached.savedAt > CARD_CACHE_TTL_MS) return null;
        if (typeof cached.poster !== "string" || typeof cached.releaseDate !== "string") return null;
        return { poster: cached.poster, releaseDate: cached.releaseDate };
    } catch {
        return null;
    }
}

function writeCardCache(movie, result) {
    try {
        localStorage.setItem(cardCacheKey(movie), JSON.stringify({ ...result, savedAt: Date.now() }));
    } catch {
        // Storage can be disabled or full; cards still work without a persistent cache.
    }
}
function getMovieCategory(movie) {
    return movie?.categories ?? movie?.catergories;
}

function getSearchEndpoint(category) {
    const value = String(category || "").toLowerCase();
    if (["movie", "movies"].includes(value)) return "movie";
    if (["tv", "series", "shows", "webseries", "anime", "cartoon"].includes(value)) return "tv";
    return "multi";
}

function matchesCategory(category, selectedCategory) {
    if (!selectedCategory) return true;
    const value = String(category || "").toLowerCase();
    if (selectedCategory === "movies") return ["movie", "movies"].includes(value);
    return ["tv", "series", "shows", "webseries", "anime", "cartoon"].includes(value);
}



export default function HomeMovie() {
    const [searchParams] = useSearchParams();
    const { profile } = useAccount();
    const { pageNo } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const selectedCategory = (searchParams.get("cat") || "").trim().toLowerCase();
    // const selectedUniverse = universes.find(universe => universe.id === selectedCategory);
    const isBrowse = location.pathname.startsWith("/recent") || Boolean(pageNo) || Boolean(search) ;
    const categoryDiscovery = !isBrowse && ["movies","shows"].includes(selectedCategory);
    const recentLabel = selectedCategory === "shows" ? "Recent Shows" : "Recent Movies";
    const seeAllUrl = `/recent${searchParams.toString() ? `?${searchParams}` : ""}`;
    const [posters, setPosters] = useState({});
    const movies = useMemo(() => [...mlist].map((movie, originalIndex) => ({ ...movie, originalIndex })).reverse(), []);
    const filtered = useMemo(() => movies.filter((movie) => {
        const category = getMovieCategory(movie);
        if (profile?.kids && !/family|animation|children/i.test(movie.Genre || "")) return false;
        const matchesSearch = !search || [movie.title, movie.title1, category].filter(Boolean).some((value) => value.toLowerCase().includes(search));
        const matchesSelection = matchesCategory(category, selectedCategory);
        // selectedUniverse
            // ? matchesUniverse(movie)
            // : selectedCategory === "universes"
                // ? universes.some(universe => matchesUniverse(movie, universe.id))
        return matchesSearch && matchesSelection;
    }), [movies, search, selectedCategory, profile?.kids]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / MOVIES_PER_PAGE));
    const requestedPage = Number(pageNo);
    const safePage = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1;
    const pageMovies = useMemo(() => filtered.slice((safePage - 1) * MOVIES_PER_PAGE, safePage * MOVIES_PER_PAGE), [filtered, safePage]);

    useEffect(() => {
        if (categoryDiscovery) return;
        const controller = new AbortController();
        async function loadMovieCard(movie) {
            const titleWithYear = movie.title1 || movie.title || "";
            const year = titleWithYear.match(/\((\d{4})\)/)?.[1] || "";
            const title = titleWithYear.replace(/\s*\(\d{4}\)\s*/g, "").trim();
            const endpoint = getSearchEndpoint(getMovieCategory(movie));
            const tmdbId = movie.tmdbid ?? movie.tmdbId ?? movie.id;
            const cached = readCardCache(movie);
            const localPoster = movie.poster_path
                ? (movie.poster_path.startsWith("http") ? movie.poster_path : `https://image.tmdb.org/t/p/w342${movie.poster_path}`)
                : null;

            // A poster path in mlist is already a TMDB image path. Use its year
            // when no cached release date is available.
            if (localPoster) {
                const result = { poster: localPoster, releaseDate: cached?.releaseDate || year };
                writeCardCache(movie, result);
                return result;
            }
            if (cached) return { ...cached, releaseDate: cached.releaseDate || year };

            try {
                let data;
                if (tmdbId) {
                    const detailEndpoint = endpoint === "multi" ? (movie.seasons?.length ? "tv" : "movie") : endpoint;
                    const response = await tmdbFetch(`https://api.themoviedb.org/3/${detailEndpoint}/${tmdbId}`, { signal: controller.signal });
                    if (response.ok) data = await response.json();
                }
                if (!data) {
                    const params = new URLSearchParams({ query: title });
                    if (year && endpoint === "movie") params.set("year", year);
                    if (year && endpoint === "tv") params.set("first_air_date_year", year);
                    const response = await tmdbFetch(`https://api.themoviedb.org/3/search/${endpoint}?${params}`, { signal: controller.signal });
                    if (response.ok) {
                        const results = (await response.json()).results || [];
                        data = results.find((result) => (result.title || result.name || "").toLowerCase() === title.toLowerCase()) || results[0];
                    }
                }
                const result = {
                    poster: data?.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : PLACEHOLDER_POSTER,
                    releaseDate: data?.release_date || data?.first_air_date || ""
                };
                writeCardCache(movie, result);
                return result;
            } catch (error) {
                if (error.name !== "AbortError") console.error("Unable to load poster:", error);
                return { poster: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : PLACEHOLDER_POSTER, releaseDate: year };
            }
        }
        async function loadPosters() {
            const missingMovies = pageMovies.filter((movie) => !posters[movie.originalIndex]?.poster);
            const results = [];
            let nextMovie = 0;

            // TMDB and image decoding become expensive when every card starts at once.
            // Four concurrent requests keep search navigation responsive.
            async function worker() {
                while (!controller.signal.aborted) {
                    const movie = missingMovies[nextMovie++];
                    if (!movie) return;
                    results.push([movie.originalIndex, await loadMovieCard(movie)]);
                }
            }

            await Promise.all(Array.from({ length: Math.min(4, missingMovies.length) }, worker));
            if (controller.signal.aborted || !results.length) return;

            setPosters((current) => ({ ...current, ...Object.fromEntries(results.map(([index, result]) => [index, result])) }));
        }

        loadPosters();
        return () => controller.abort();
    }, [pageMovies, posters, categoryDiscovery]);

    function changePage(nextPage) {
        if (nextPage < 1 || nextPage > totalPages) return;
        const query = searchParams.toString();
        navigate(nextPage === 1 ? `/recent${query ? `?${query}` : ""}` : `/recent/page/${nextPage}${query ? `?${query}` : ""}`);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (categoryDiscovery) return <BrowseSection kindOverride={selectedCategory === "movies" ? "discover-movies" : "series-discover"} />;

    const cards = pageMovies.map(movie => <Link key={movie.originalIndex} to={`/movie/${movie.originalIndex}`} state={{ returnTo: `${location.pathname}${location.search}` }}><article className="card"><PosterImage src={posters[movie.originalIndex]?.poster || PLACEHOLDER_POSTER} alt={movie.title} /><span>{movie.title}</span>{posters[movie.originalIndex]?.releaseDate && <small className="release-date">{posters[movie.originalIndex].releaseDate}</small>}</article></Link>);

    return <>{!isBrowse && <FeaturedHero />}<main className="HomeMovie">
        {/* {(!isBrowse) && <section className="movie-section">
            <h2>Cinematic Universes</h2>
            <ul aria-label="Cinematic universes">
                {universes.map(universe => <li key={universe.id}>
                    <Link to={`/?cat=${universe.id}`} aria-current={selectedUniverse?.id === universe.id ? "page" : undefined}>{universe.label}</Link>
                </li>)}
            </ul>
        </section>} */}
        {!isBrowse && ["", "movies", "shows"].includes(selectedCategory) && <MovieSections category={selectedCategory || "all"} />}
        {isBrowse ? <>
            <Link className="back-link" to={`/${selectedCategory ? `?cat=${encodeURIComponent(selectedCategory)}` : ""}`}>← Back to home</Link>
            <h1>{search ? "Search results" : recentLabel}</h1>
            {search && <p className="search-results">Showing {filtered.length} result{filtered.length === 1 ? "" : "s"} for “{searchParams.get("search")}”</p>}
            <div className="cards">{cards}</div>
            {filtered.length === 0 && <p className="empty-state">No titles matched your search.</p>}
        {filtered.length > 0 && <nav className="pagination" aria-label="Movie pages">
            <button type="button" className="endluttons" onClick={() => changePage(safePage - 1)} disabled={safePage === 1}>Previous</button>
            <button type="button" onClick={() => changePage(1)} hidden={safePage < 3}>1</button>
            <button type="button" onClick={() => changePage(2)} hidden={safePage < 4 || safePage >= totalPages}>2</button>
            <button type="button" disabled hidden={safePage < 5}>...</button>
            <button type="button" onClick={() => changePage(safePage - 1)} hidden={safePage === 1}>{safePage - 1}</button>
            <button type="button" onClick={() => changePage(safePage)} className="active" disabled style={{ backgroundColor: "#FEA12E80" }}>{safePage}</button>
            <button type="button" onClick={() => changePage(safePage + 1)} hidden={safePage === totalPages}>{safePage + 1}</button>
            <button type="button" disabled hidden={safePage > totalPages - 4}>...</button>
            <button type="button" onClick={() => changePage(totalPages - 1)} hidden={safePage > totalPages - 3}>{totalPages - 1}</button>
            <button type="button" onClick={() => changePage(totalPages)} hidden={safePage > totalPages - 2}>{totalPages}</button>
            <button type="button" className="endruttons" onClick={() => changePage(safePage + 1)} disabled={safePage === totalPages}>Next</button>
            <li className="page-item"><input type="number" min="1" max={totalPages} placeholder="Go to" className="form-control page-link" style={{ width: "70px", marginLeft: "10px" }} onKeyDown={(event) => { if (event.key === "Enter") { const page = parseInt(event.target.value, 10); if (!Number.isNaN(page) && page >= 1 && page <= totalPages) { changePage(page); event.target.value = ""; } } }} /></li>
            <span>Page {safePage} of {totalPages}</span>
        </nav>}

        </> : <div className="live-sections recent-section">
            <section className="movie-section">
                <div className="section-heading"><h2>{recentLabel}</h2><Link className="see-all-link" to={seeAllUrl}>See all →</Link></div>
                {filtered.length ? <MovieRow key={`recent:${selectedCategory}:${profile?.kids}`} kind="recent" label={recentLabel}>{cards}</MovieRow> : <p className="empty-state">No titles available.</p>}
            </section>
        </div>}
    </main></>;
}
