export function getReviewMovieId(movie) {
  const raw = String(movie.categories ?? movie.catergories ?? '').toLowerCase();
  const category = ['movie','movies'].includes(raw) ? 'movie' : ['tv','series','shows','webseries','anime','cartoon'].includes(raw) ? 'tv' : 'multi';
  const sourceId = movie.tmdbid ?? movie.tmdbId ?? movie.id;
  const title = String(movie.title || movie.title1 || '').replace(/\s*\(\d{4}\)\s*/g, ' ').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  const year = (movie.title || movie.title1 || '').match(/\((\d{4})\)/)?.[1] || 'unknown';
  if (category === 'tv' && !movie.live) {
    const seasons = [...new Set((movie.seasons || []).map(s => String(s.seasonid ?? s.season)))].sort().join(',') || 'all';
    return `tv:entry:${title.slice(0,120)}:${year}:seasons:${seasons.slice(0,60)}`;
  }
  if (sourceId) return `${category}:${sourceId}`;
  const legacyTitle = String(movie.title1 || movie.title || '').replace(/\s*\(\d{4}\)\s*/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const legacyYear = (movie.title1 || movie.title || '').match(/\((\d{4})\)/)?.[1] || 'unknown';
  return `${category}:${legacyYear}:${legacyTitle}`;
}
