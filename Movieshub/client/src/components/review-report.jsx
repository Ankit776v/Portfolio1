import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function ReviewReport({ movieId, reviewId }) {
  const { send } = useAuth();
  const [open,setOpen] = useState(false), [reason,setReason] = useState('spam');
  const [busy,setBusy] = useState(false), [message,setMessage] = useState(''), [sent,setSent] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      await send(`/api/movies/${encodeURIComponent(movieId)}/reviews/${reviewId}/report`, { method:'POST', body:JSON.stringify({ reason }) });
      setSent(true); setOpen(false); setMessage('Report received. Thank you for helping keep reviews useful.');
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <div className="review-report">
    {!open && !sent && <button type="button" onClick={() => setOpen(true)}>Report review</button>}
    {open && <form onSubmit={submit}><label>Reason<select value={reason} onChange={event => setReason(event.target.value)}>{[['spam','Spam'],['abuse','Abusive content'],['spoiler','Unmarked spoiler'],['other','Other']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><button disabled={busy}>{busy ? 'Sending...' : 'Send report'}</button><button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button></form>}
    {message && <p role="status">{message}</p>}
  </div>;
}
