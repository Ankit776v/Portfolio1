import { useEffect, useState } from 'react';

const FALLBACK = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 342 513%22%3E%3Crect width=%22342%22 height=%22513%22 fill=%22%23212228%22/%3E%3Cpath d=%22M127 214h88v68h-88z%22 fill=%22%233a3b43%22/%3E%3Ctext x=%22171%22 y=%22320%22 text-anchor=%22middle%22 fill=%22%23999%22 font-family=%22Arial%22 font-size=%2218%22%3ENo poster%3C/text%3E%3C/svg%3E';

export default function PosterImage({ src, alt, className = 'cardimg', loading = 'lazy', ...props }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(false); setLoaded(false); }, [src]);
  return <img {...props} className={`${className} poster-image${loaded ? ' is-loaded' : ''}`} src={failed || !src ? FALLBACK : src} alt={alt}
    loading={loading} decoding="async" onLoad={() => setLoaded(true)} onError={() => { if (!failed) { setLoaded(false); setFailed(true); } }} />;
}
