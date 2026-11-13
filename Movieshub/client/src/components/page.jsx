import SeriesSeasons from './series-seasons.jsx';
import ReviewReport from './review-report.jsx';
import { tmdbFetch } from '../tmdb.js';
import { getReviewMovieId } from '../review-identity.js';
import { Link, useLocation, useParams } from "react-router-dom";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useAccount } from "../account-context.jsx";
import TitleActions from "./title-actions.jsx";
import WatchLink from "./watch-link.jsx";
import mlist from "./mlist.jsx";
import { useAuth } from "../auth.jsx";



const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/original";

function getSearchEndpoint(category) {
    const normalizedCategory = String(category || "").toLowerCase();

    if (normalizedCategory === "movies" || normalizedCategory === "movie") return "movie";
    if (["tv", "series", "shows", "anime", "webseries", "cartoon"].includes(normalizedCategory)) return "tv";

    return "multi";
}

function getMovieCategory(movie) {
    return movie?.categories ?? movie?.catergories;
}

function getResultEndpoint(result) {
    return result?.media_type === "tv" || result?.first_air_date ? "tv" : "movie";
}


function formatReviewDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function isWatchLink(url) {
    if (typeof url !== "string" || url.trim() === "" || url.startsWith("link")) return false;
    try {
        const protocol = new URL(url).protocol;
        return protocol === "https:" || protocol === "http:";
    } catch {
        return false;
    }
}

function Page() {
    const { movieIndex, mediaType, tmdbId } = useParams();
    const location = useLocation();
    const { profile } = useAccount();
    const movie = useMemo(() => {
        if (tmdbId && ['movie', 'tv'].includes(mediaType) && /^\d+$/.test(tmdbId)) {
            const matches = mlist.filter(i => String(i.tmdbid ?? i.tmdbId ?? i.id) === tmdbId && getSearchEndpoint(getMovieCategory(i)) === mediaType);
            return matches.length === 1 ? matches[0] : { id: Number(tmdbId), title: '', categories: mediaType, live: true };
        }
        return mlist[Number(movieIndex)];
    }, [movieIndex, mediaType, tmdbId]);
    const episodeMovieIndex = movieIndex ?? mlist.indexOf(movie);
    const [tmdbMovie, setTmdbMovie] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [castMembers, setCastMembers] = useState([]);
    const [crewMembers, setCrewMembers] = useState([]);
    const [trailerKey, setTrailerKey] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [reviewScope, setReviewScope] = useState("");
    const [reviewPage, setReviewPage] = useState(1), [reviewSort, setReviewSort] = useState('newest');
    const [reviewStats, setReviewStats] = useState({ total: 0, totalPages: 1, averageRating: null });
    const [reviewRevision, setReviewRevision] = useState(0);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [reviewError, setReviewError] = useState("");
    const [reviewText, setReviewText] = useState("");
    const [reviewRating, setReviewRating] = useState("5");
    const [submittingReview, setSubmittingReview] = useState(false);
    const [editingReviewId, setEditingReviewId] = useState(null);
    const [editReviewText, setEditReviewText] = useState("");
    const [editReviewRating, setEditReviewRating] = useState("5");
    const [deletingReviewId, setDeletingReviewId] = useState(null);
    const { user, send } = useAuth();
    const reviewMovieId = movie ? getReviewMovieId(movie) : "";
    const reviewKey = `${reviewMovieId}:${reviewPage}:${reviewSort}`;
    const visibleReviews = reviewScope === reviewKey ? reviews : [];
    const [seasonOverview, setSeasonOverview] = useState("");

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

    const cast = useCallback(async (tvId, endpoint) => {
        try {
            // Movie
            if (endpoint !== "tv" || !movie.seasons?.length) {
                const response = await tmdbFetch(
                    `https://api.themoviedb.org/3/${endpoint}/${tvId}/credits`
                );

                const data = await response.json();

                setCastMembers(
                    (data.cast || [])
                        .filter(actor => actor.profile_path)
                        .slice(0, 50)
                );

                return;
            }

            // TV Show
            const allCast = [];

            for (const season of movie.seasons) {
                const response = await tmdbFetch(
                    `https://api.themoviedb.org/3/tv/${tvId}/season/${season.seasonid}/credits`
                );

                const data = await response.json();

                if (data.cast) {
                    allCast.push(...data.cast);
                }
            }

            // Remove duplicate actors
            const seen = new Set();

            const uniqueCast = allCast.filter(actor => {
                const key = actor.id; // TMDB id is unique

                if (seen.has(key)) return false;

                seen.add(key);
                return actor.profile_path;
            });

            setCastMembers(uniqueCast.slice(0, 50));

        } catch (err) {
            console.error(err);
        }
    }, [movie]);

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
                        const key = `${person.id}-${person.department || person.known_for_department}-${person.job || ""}`;

                        if (seen.has(key)) return false;

                        seen.add(key);
                        return true;
                    })

                    // Sort by department, then by name
                    .sort((a, b) => {
                        const depA = departmentOrder[a.department || a.known_for_department] ?? 999;
                        const depB = departmentOrder[b.department || b.known_for_department] ?? 999;

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
        if (!movie || !tmdbMovie || !movie.seasons?.length) return;

        const endpoint = getSearchEndpoint(getMovieCategory(movie));

        if (endpoint !== "tv") {
            setSeasonOverview("");
            return;
        }

        // Find the oldest season listed in mlist
        const oldestSeason = [...movie.seasons]
            .sort((a, b) => Number(a.season) - Number(b.season))[0];

        if (!oldestSeason?.seasonid) return;

        async function loadSeasonOverview() {
            try {
                const response = await tmdbFetch(
                    `https://api.themoviedb.org/3/tv/${tmdbMovie.id}/season/${oldestSeason.seasonid}`
                );

                if (!response.ok) return;

                const data = await response.json();

                setSeasonOverview(data.overview || "");
            } catch (error) {
                console.error("Unable to load season overview:", error);
            }
        }

        loadSeasonOverview();
    }, [movie, tmdbMovie]);

    async function fetchTrailer(id, endpoint, seasonid, signal) {
        async function getVideos(url) {
            const response = await tmdbFetch(url, { signal });

            if (!response.ok) return [];

            const data = await response.json();
            return Array.isArray(data.results) ? data.results : [];
        }

        async function getAllVideos(baseUrl) {
            // Get Hindi
            const hindi = await getVideos(
                `${baseUrl}?language=hi-IN`
            );

            // Get English
            const english = await getVideos(
                `${baseUrl}?language=en-US`
            );

            // No language filter = additional/default videos
            const all = await getVideos(
                `${baseUrl}`
            );

            // Combine + remove duplicate YouTube videos
            const seen = new Set();

            return [...hindi, ...english, ...all].filter(video => {
                if (!video.key || seen.has(video.key)) return false;

                seen.add(video.key);
                return true;
            });
        }

        let videos = [];

        if (endpoint === "movie") {

            videos = await getAllVideos(
                `https://api.themoviedb.org/3/movie/${id}/videos`
            );

        } else {

            // First try the specific season
            if (seasonid != null) {
                videos = await getAllVideos(
                    `https://api.themoviedb.org/3/tv/${id}/season/${seasonid}/videos`
                );
            }

            // Fall back to the main TV show
            if (!videos.length) {
                videos = await getAllVideos(
                    `https://api.themoviedb.org/3/tv/${id}/videos`
                );
            }
        }

        const trailer =
            // Official trailer first
            videos.find(video =>
                video.site === "YouTube" &&
                video.type === "Trailer" &&
                video.official
            ) ||

            // Any trailer
            videos.find(video =>
                video.site === "YouTube" &&
                video.type === "Trailer"
            ) ||

            // Teaser
            videos.find(video =>
                video.site === "YouTube" &&
                video.type === "Teaser"
            ) ||

            // Finally any YouTube video
            videos.find(video =>
                video.site === "YouTube"
            );

        return trailer?.key || null;
    }

    useEffect(() => {
        if (!movie) return undefined;

        const controller = new AbortController();

        async function fetchMovieData() {
            const titleWithYear = movie.title1 || movie.title || "";
            const year = titleWithYear.match(/\((\d{4})\)/)?.[1];
            const title = titleWithYear.replace(/\s*\(\d{4}\)\s*/g, "").trim();
            const endpoint = getSearchEndpoint(getMovieCategory(movie));
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
                    const detailEndpoint = endpoint === "multi"
                        ? (movie.seasons?.length ? "tv" : "movie")
                        : endpoint;
                    const response = await tmdbFetch(
                        `https://api.themoviedb.org/3/${detailEndpoint}/${tmdbId}`,
                        { signal: controller.signal }
                    );
                    if (!response.ok) throw new Error(`TMDB request failed (${response.status})`);
                    const data = await response.json();
                    const id = tmdbId;
                    const lastSeasonId = movie.seasons?.at(-1)?.seasonid;

                    if (!controller.signal.aborted) {
                        setTmdbMovie({ ...data, media_type: detailEndpoint });
                    }
                    cast(id, detailEndpoint);
                    crew(id, detailEndpoint, lastSeasonId);
                    fetchTrailer(id, detailEndpoint, lastSeasonId, controller.signal)
                        .then((key) => { if (!controller.signal.aborted) setTrailerKey(key); })
                        .catch((error) => { if (error.name !== "AbortError") console.error("Unable to load trailer:", error); });
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
                    const id = best.id;
                    const seasonid = movie.seasons?.at(-1)?.seasonid;
                    const resolvedEndpoint = getResultEndpoint(best);
                    const detailResponse = await tmdbFetch(
                        `https://api.themoviedb.org/3/${resolvedEndpoint}/${id}`,
                        { signal: controller.signal }
                    );
                    const details = detailResponse.ok ? await detailResponse.json() : best;

                    best = { ...details, media_type: resolvedEndpoint };
                    cast(id, resolvedEndpoint);
                    crew(id, resolvedEndpoint, seasonid);
                    fetchTrailer(id, resolvedEndpoint, seasonid, controller.signal)
                        .then((key) => { if (!controller.signal.aborted) setTrailerKey(key); })
                        .catch((error) => { if (error.name !== "AbortError") console.error("Unable to load trailer:", error); });
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
    }, [movie, cast, crew]);



    useEffect(() => {
        if (!reviewMovieId) return undefined;
        const controller = new AbortController();
        setReviewsLoading(true);
        setReviewError("");

        send(`/api/movies/${encodeURIComponent(reviewMovieId)}/reviews?page=${reviewPage}&sort=${reviewSort}`, { signal: controller.signal })
            .then(({ reviews: loadedReviews, ...stats }) => {
                if (!controller.signal.aborted) { setReviews(loadedReviews || []); setReviewScope(reviewKey); setReviewStats(stats); }
            })
            .catch((error) => {
                if (error.name !== "AbortError" && !controller.signal.aborted) setReviewError(error.message || "Reviews could not be loaded.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setReviewsLoading(false);
            });

        return () => controller.abort();
    }, [reviewMovieId, reviewPage, reviewSort, reviewKey, reviewRevision, send]);

    async function submitReview(event) {
        event.preventDefault();
        if (!user || !reviewText.trim()) return;

        setSubmittingReview(true);
        setReviewError("");
        try {
            await send(`/api/movies/${encodeURIComponent(reviewMovieId)}/reviews`, {
                method: "POST",
                body: JSON.stringify({
                    movieTitle: tmdbMovie?.title || tmdbMovie?.name || movie.title || movie.title1 || "",
                    rating: Number(reviewRating),
                    text: reviewText.trim()
                }),
            });
            setReviewPage(1); setReviewRevision(value => value + 1);
            setReviewText("");
        } catch (error) {
            setReviewError(error.message || "Your review could not be posted.");
        } finally {
            setSubmittingReview(false);
        }
    }

    function startEditingReview(review) {
        setEditingReviewId(review.id);
        setEditReviewRating(String(review.rating));
        setEditReviewText(review.text);
        setReviewError("");
    }

    async function saveReview(reviewId) {
        if (!editReviewText.trim()) return;
        setSubmittingReview(true);
        setReviewError("");
        try {
            await send(`/api/movies/${encodeURIComponent(reviewMovieId)}/reviews/${reviewId}`, {
                method: "PUT",
                body: JSON.stringify({ rating: Number(editReviewRating), text: editReviewText.trim() }),
            });
            setReviewRevision(value => value + 1);
            setEditingReviewId(null);
            setEditReviewText("");
        } catch (error) {
            setReviewError(error.message || "Your review could not be updated.");
        } finally {
            setSubmittingReview(false);
        }
    }

    async function deleteReview(reviewId) {
        if (!window.confirm("Delete this review? This cannot be undone.")) return;
        setDeletingReviewId(reviewId);
        setReviewError("");
        try {
            await send(`/api/movies/${encodeURIComponent(reviewMovieId)}/reviews/${reviewId}`, {
                method: "DELETE",
            });
            if (visibleReviews.length === 1 && reviewPage > 1) setReviewPage(value => value - 1); else setReviewRevision(value => value + 1);
            if (editingReviewId === reviewId) setEditingReviewId(null);
        } catch (error) {
            setReviewError(error.message || "Your review could not be deleted.");
        } finally {
            setDeletingReviewId(null);
        }
    }

    const backdropUrl = movie?.back_poster ? `${TMDB_IMAGE_BASE_URL}${movie.back_poster}` : tmdbMovie?.backdrop_path ? `${TMDB_IMAGE_BASE_URL}${tmdbMovie.backdrop_path}` : null;

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

    if (profile?.kids && (!tmdbMovie || tmdbMovie.adult || !tmdbMovie.genres?.some(g => [10751, 10762, 16].includes(g.id)))) {
        return <main className="account-page"><h1>Family catalogue</h1><p>{isLoading ? 'Checking title details…' : tmdbMovie ? 'This title is outside the family genre filter.' : 'Could not verify this title for the family filter.'}</p><Link to="/">Browse family movies</Link></main>;
    }
    const movieLinks = Array.isArray(movie.links)
        ? movie.links.map((entry, index) => [entry?.name || entry?.platform || index, typeof entry === "string" ? entry : entry?.link || entry?.url])
        : Object.entries(movie.links || {});
    const links = movieLinks.filter(([, url]) => isWatchLink(url));
    const localSeasons = movie.seasons || [];
    const seasons = localSeasons.length ? localSeasons : Array.isArray(tmdbMovie?.seasons) ? tmdbMovie.seasons : [];
    const isSeries =
        getSearchEndpoint(getMovieCategory(movie)) === "tv";

    const overview = isSeries ? seasonOverview || tmdbMovie?.overview || movie.About : tmdbMovie?.overview || movie.About;
    const release_date = tmdbMovie?.release_date || tmdbMovie?.first_air_date || movie.Released

    return (
        <main className="movie-page" style={pageStyle}>
            <Link className="back-link" to={location.state?.returnTo || "/"}>← Back to movies</Link>

            <section className="movie-hero">
                <p className="movie-category">{tmdbMovie?.media_type || getMovieCategory(movie) || "Movie"}</p>
                <h1>{movie.title || tmdbMovie?.title || tmdbMovie?.name || "Movie details"}</h1>
                <div className="trailer">
                    {trailerKey && (
                        <iframe
                            src={`https://www.youtube-nocookie.com/embed/${trailerKey}`}
                            title={`${movie.title} trailer`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    )}
                </div>
                <TitleActions item={tmdbMovie ? { id: Number(tmdbMovie.id), type: getResultEndpoint(tmdbMovie), title: tmdbMovie.title || tmdbMovie.name || movie.title, poster: tmdbMovie.poster_path } : null} />
                {overview && <p className="movie-about">Plot -{overview}</p>}
                {release_date && <p className="movie-about">Release date -{release_date} </p>}
                {isLoading && <p className="tmdb-status">Loading movie details</p>}

                {links.length > 0 && (
                    <section className="movie-section">
                        <div className="watch-links watch-links-content">
                            {links.map(([name, url], index) => (
                                <WatchLink key={`${name}:${url}`} url={url} title={movie.title} label={index === 0 ? "Watch Now" : `Watch option ${index + 1}`} />
                            ))}
                        </div>
                    </section>
                )}
            </section>

            <section className="movie-section reviews-section" aria-busy={reviewsLoading}>
                <div className="reviews-heading"><h2>Reviews</h2><span>{reviewScope === reviewKey ? `${reviewStats.total} reviews${reviewStats.averageRating !== null ? ` · ${reviewStats.averageRating.toFixed(1)} / 5` : ""}` : "Loading ratings..."}</span></div>
                <label className="review-sort">Sort reviews<select value={reviewSort} onChange={event => { setReviewSort(event.target.value); setReviewPage(1); }}>{[['newest', 'Newest first'], ['oldest', 'Oldest first'], ['highest', 'Highest rated'], ['lowest', 'Lowest rated']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                {user ? (
                    <form className="review-form" onSubmit={submitReview}>
                        <label>Rating<select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)} aria-label="Your rating">{[5, 4, 3, 2, 1].map((rating) => <option value={rating} key={rating}>{rating} star{rating === 1 ? "" : "s"}</option>)}</select></label>
                        <label>Your review<textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} minLength="150" maxLength="1500" required placeholder="Share what you thought about this title..." /></label>
                        <button type="submit" disabled={submittingReview}>{submittingReview ? "Posting..." : "Post review"}</button>
                    </form>
                ) : <p className="review-login-prompt"><Link to="/login">Log in</Link> to give this title a rating and write a review.</p>}
                {reviewError && <p className="review-error" role="alert">{reviewError} <button onClick={() => setReviewRevision(value => value + 1)}>Retry loading</button></p>}
                {reviewsLoading ? <p className="tmdb-status">Loading reviews...</p> : visibleReviews.length > 0 ? <div className="review-list">{visibleReviews.map((review) => {
                    const isOwner = user?.id === review.user.id;
                    const isEditing = editingReviewId === review.id;
                    return <article className="review-card" key={review.id}>
                        <div><strong>{review.user.name}</strong><span className="review-rating">{"\u2605".repeat(review.rating)}{"\u2606".repeat(5 - review.rating)}</span></div>
                        {isEditing ? <form className="review-form review-edit-form" onSubmit={(event) => { event.preventDefault(); saveReview(review.id); }}>
                            <label>Rating<select value={editReviewRating} onChange={(event) => setEditReviewRating(event.target.value)}>{[5, 4, 3, 2, 1].map((rating) => <option value={rating} key={rating}>{rating} star{rating === 1 ? "" : "s"}</option>)}</select></label>
                            <label>Edit review<textarea value={editReviewText} onChange={(event) => setEditReviewText(event.target.value)} minLength="150" maxLength="1500" required /></label>
                            <div className="review-actions"><button type="submit" disabled={submittingReview}>{submittingReview ? "Saving..." : "Save changes"}</button><button type="button" onClick={() => setEditingReviewId(null)}>Cancel</button></div>
                        </form> : <><p>{review.text}</p><time dateTime={review.createdAt}>{formatReviewDate(review.updatedAt || review.createdAt)}{review.updatedAt !== review.createdAt ? " (edited)" : ""}</time>{isOwner && <div className="review-actions"><button type="button" onClick={() => startEditingReview(review)}>Edit</button><button type="button" onClick={() => deleteReview(review.id)} disabled={deletingReviewId === review.id}>{deletingReviewId === review.id ? "Deleting..." : "Delete"}</button></div>}{user && !isOwner && <ReviewReport movieId={reviewMovieId} reviewId={review.id} />}</>}
                    </article>;
                })}</div> : <p className="empty-state">No reviews yet. Be the first to share your thoughts.</p>}
                <nav className="pagination" aria-label="Review pages"><button disabled={reviewsLoading || reviewPage === 1} onClick={() => setReviewPage(value => value - 1)}>Previous</button><span>Page {reviewPage} of {reviewStats.totalPages}</span><button disabled={reviewsLoading || reviewPage >= reviewStats.totalPages} onClick={() => setReviewPage(value => value + 1)}>Next</button></nav>
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
                                <Link to={`/crew/${actor.id}`} key={actor.id}>
                                    <div className="actor">
                                        <img
                                            src={
                                                actor.profile_path
                                                    ? `https://image.tmdb.org/t/p/w185${actor.profile_path}`
                                                    : "/images/avatar.png"
                                            }
                                            alt={actor.name}
                                        />

                                        <h5>{actor.name}</h5>
                                        <p>{actor.job || actor.department || actor.known_for_department}</p>
                                    </div>
                                </Link>
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


            {isSeries && tmdbMovie?.id && <SeriesSeasons seriesId={tmdbMovie.id} seasons={seasons} localSeasons={localSeasons} localIndex={episodeMovieIndex} />}

            {links.length === 0 && seasons.length === 0 && <p className="empty-state">Links will be added soon.</p>}
        </main>
    );
}

export default function PageRoute() { const location = useLocation(); return <Page key={location.pathname} />; }
