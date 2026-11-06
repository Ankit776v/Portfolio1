import { useId, useState } from 'react';

function getYouTubeVideoId(value) {
  if (typeof value !== 'string') return null;
  let url;
  try { url = new URL(value); } catch { return null; }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0]?.match(/^[\w-]{11}$/)?.[0] || null;
  if (!['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) return null;

  const pathParts = url.pathname.split('/').filter(Boolean);
  const candidate = url.pathname === '/watch'
    ? url.searchParams.get('v')
    : ['embed', 'shorts', 'live', 'v'].includes(pathParts[0]) ? pathParts[1] : null;
  return candidate?.match(/^[\w-]{11}$/)?.[0] || null;
}

export default function WatchLink({ url, label, title }) {
  const [isOpen, setIsOpen] = useState(false);
  const embedId = useId();
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return <a href={url} target="_blank" rel="noreferrer">{label}</a>;

  if (!isOpen) return <button type="button" className="watch-link-button" aria-expanded="false" aria-controls={embedId} onClick={() => setIsOpen(true)}>{label || 'Watch Now'}</button>;

  return <div className="watch-embed">
    <iframe
      id={embedId}
      src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
      title={title || label || 'YouTube video'}
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
    <button type="button" className="watch-embed-close" aria-expanded="true" aria-controls={embedId} onClick={() => setIsOpen(false)}>Hide video</button>
  </div>;
}
