import mlist from './mlist.jsx';
import { catalogueLink } from '../catalogue-link.js';
import { Link } from 'react-router-dom';
import { useAccount } from '../account-context.jsx';
export default function MyList() {
  const { profile } = useAccount();
  return <main className="account-page"><h1>My List {profile && `· ${profile.name}`}</h1>{!profile ? <p><Link to="/account">Sign in and select an unlocked profile</Link> to see your list.</p> : !profile.watchlist.length ? <p>Use + My List on a title to save it here.</p> : <div className="cards">{profile.watchlist.map(i => <Link key={`${i.type}:${i.id}`} to={catalogueLink(i, mlist)}><article className="card"><img className="cardimg" loading="lazy" alt={i.title} src={i.poster ? `https://image.tmdb.org/t/p/w342${i.poster}` : 'https://placehold.co/342x513?text=No+Poster'} /><span>{i.title}</span></article></Link>)}</div>}</main>;
}
