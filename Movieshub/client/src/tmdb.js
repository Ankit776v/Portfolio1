// Provider credentials stay on the API server, never in Vite output.
export function tmdbFetch(input, options = {}) {
  const url = new URL(input);
  if (url.origin !== 'https://api.themoviedb.org' || !url.pathname.startsWith('/3/')) throw new Error('Invalid metadata URL.');
  url.searchParams.delete('api_key');
  return fetch(`${import.meta.env.VITE_API_URL || import.meta.env.BASE_URL.replace(/\/$/, '')}/api/tmdb/${url.pathname.slice(3)}?${url.searchParams}`, { ...options, credentials: 'include' });
}
