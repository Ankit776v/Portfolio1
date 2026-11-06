import { useAccount } from '../account-context.jsx';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { signOut } = useAccount();
  const [error, setError] = useState('');
  const category = params.get('cat');
  function search(event) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('search')?.trim();
    navigate(value ? `/?search=${encodeURIComponent(value)}` : '/');
  }
  return <nav className="Navbar" aria-label="Movieshub navigation">
    <Link className="movie-wordmark" to="/" aria-label="Movieshub home"><span className="brand-movies">Movies</span><span className="brand-hub">Hub</span></Link>
    <div className="movie-navlinks">
      <Link to="/" aria-current={location.pathname === '/' && !category ? 'page' : undefined}>Home</Link>
      <Link to="/?cat=movies" aria-current={category === 'movies' ? 'page' : undefined}>Movies</Link>
      <Link to="/?cat=shows" aria-current={category === 'shows' ? 'page' : undefined}>TV Shows</Link>
      <Link to="/my-list" aria-current={location.pathname === '/my-list' ? 'page' : undefined}>My List</Link>
      <details className="movie-browse"><summary>Browse</summary><div><Link to="/recent">Recently added</Link><Link to="/?cat=originals">Our Original</Link><Link to="/?cat=languages">By language</Link><Link to="/?cat=free">Free titles</Link></div></details>
    </div>
    <form className="movie-search" onSubmit={search} role="search"><input key={params.get('search') || ''} type="search" name="search" defaultValue={params.get('search') || ''} placeholder="Titles, movies, shows" aria-label="Search movies and shows" /><button type="submit" aria-label="Search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button></form>
    <div className="movie-user">
      {user ? <><Link className="movie-profile" to="/account" aria-label={`Account for ${user.name}`}>{user.name?.[0]?.toUpperCase() || 'M'}</Link><button className="movie-signout" type="button" onClick={() => signOut().catch(e => setError(e.message))}>Sign out</button></> : <><Link className="movie-signin" to="/login">Sign in</Link><Link className="movie-join" to="/signup">Join now</Link></>}
    </div>
    {error && <p className="movie-naverror" role="alert">{error}</p>}
  </nav>;
}
