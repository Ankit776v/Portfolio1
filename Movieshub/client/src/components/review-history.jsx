import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { getReviewMovieId } from '../review-identity.js';
import mlist from './mlist.jsx';

function titleLink(movieId) {
  const index = mlist.findIndex(movie => getReviewMovieId(movie) === movieId);
  if (index >= 0) return `/movie/${index}`;
  const match = /^(movie|tv):(\d+)$/.exec(movieId);
  return match ? `/title/${match[1]}/${match[2]}` : null;
}
export default function ReviewHistory() {
  const { user, send } = useAuth();
  const [page,setPage] = useState(1), [revision,setRevision] = useState(0), [stored,setStored] = useState(null);
  const scope = `${user?.id}:${page}:${revision}`;
  const current = stored?.scope === scope ? stored : null;
  useEffect(() => {
    const controller = new AbortController();
    send(`/api/account/reviews?page=${page}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setStored({ scope, data }); })
      .catch(error => { if (!controller.signal.aborted) setStored({ scope, error: error.message }); });
    return () => controller.abort();
  }, [page,scope,send]);
  if (!current) return <section aria-busy="true"><h2>Your reviews</h2><p role="status">Loading your reviews...</p></section>;
  if (current.error) return <section><h2>Your reviews</h2><p role="alert">{current.error}</p><button onClick={() => setRevision(value => value + 1)}>Retry</button></section>;
  const { reviews, total, totalPages } = current.data;
  return <section><h2>Your reviews</h2><p>{total} reviews, newest first. Reviews belong to your account across profiles.</p>
    {!reviews.length ? <p className="empty-state">You haven’t reviewed a title yet. Open a movie or show to share your thoughts.</p> : <div className="review-list">{reviews.map(review => {
      const link = titleLink(review.movieId), title = review.movieTitle || 'Reviewed title';
      return <article className="review-card" key={review.id}><h3>{link ? <Link to={link}>{title}</Link> : title}</h3><p aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}</p><p>{review.text}</p><time dateTime={review.updatedAt}>{new Date(review.updatedAt).toLocaleDateString('en-IN')}</time>{link && <p><Link to={link}>View or edit review</Link></p>}</article>;
    })}</div>}
    <nav className="pagination" aria-label="Your review history pages"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Next</button></nav>
  </section>;
}
