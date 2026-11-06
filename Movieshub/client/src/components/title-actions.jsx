import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../account-context.jsx';
export default function TitleActions({ item }) {
  const { account, profile, api } = useAccount();
  const [message,setMessage] = useState(''), [busy,setBusy] = useState(false);
  const id = item?.id, type = item?.type, profileId = profile?.id;
  useEffect(() => {
    if (id && profileId) api(`/profiles/${profileId}/history`,'POST',{ item }).catch(e => setMessage(e.message));
  }, [id,type,profileId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(action,data) { setBusy(true); setMessage(''); try { await api(`/profiles/${profileId}/${action}`,'POST',data); } catch(e) { setMessage(e.message); } finally { setBusy(false); } }
  if (!id) return null;
  if (!account) return <p><Link to="/login">Sign in</Link> to save this title and rate it.</p>;
  if (!profile) return <p><Link to="/account">Select and unlock a profile</Link> to save this title.</p>;
  const saved = profile.watchlist.some(i => i.id === id && i.type === type), rating = profile.ratings[`${type}:${id}`];
  return <div className="title-actions"><button disabled={busy} onClick={() => act('watchlist',{ item })}>{saved ? '✓ In My List' : '+ My List'}</button>{[[1,'Like'],[-1,'Dislike']].map(([r,label]) => <button key={r} disabled={busy} aria-pressed={rating === r} onClick={() => act('ratings',{ key:`${type}:${id}`, rating:rating === r ? 0 : r })}>{rating === r ? '✓ ' : ''}{label}</button>)}<p role="status">{message}</p></div>;
}
