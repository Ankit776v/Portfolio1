function normalizeTitle(value) {
  return String(value || '').replace(/\(\d{4}\)/g, '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
function mediaType(item) {
  const category = String(item.categories ?? item.catergories ?? '').toLowerCase();
  if (['movie', 'movies'].includes(category)) return 'movie';
  if (['tv', 'series', 'shows', 'webseries', 'anime', 'cartoon'].includes(category)) return 'tv';
  return item.seasons?.length ? 'tv' : 'movie';
}
export function catalogueLink(item, catalogue, type = item.type || item.media_type || 'movie') {
  const candidates = catalogue.map((entry, index) => ({ entry, index })).filter(({ entry }) => mediaType(entry) === type);
  const idMatch = candidates.find(({ entry }) => {
    const id = entry.tmdbid ?? entry.tmdbId ?? entry.id;
    return id != null && String(id) === String(item.id);
  });
  if (idMatch) return `/movie/${idMatch.index}`;

  const titles = [item.title, item.name, item.original_title, item.original_name].map(normalizeTitle).filter(Boolean);
  const year = (item.release_date || item.first_air_date || '').match(/^\d{4}/)?.[0] || (item.title || item.name || '').match(/\((\d{4})\)/)?.[1];
  const matches = candidates.filter(({ entry }) => {
    // An explicit different TMDB ID identifies a different title, even if names match.
    if ((entry.tmdbid ?? entry.tmdbId ?? entry.id) != null) return false;
    const localYear = [entry.title, entry.title1, entry.Released].map(value => String(value || '').match(/\b(\d{4})\b/)?.[1]).find(Boolean);
    if (year && localYear && year !== localYear) return false;
    return [entry.title, entry.title1].some(title => titles.includes(normalizeTitle(title)));
  });
  // Avoid guessing between remakes or duplicate names when metadata is incomplete.
  return matches.length === 1 ? `/movie/${matches[0].index}` : `/title/${type}/${item.id}`;
}
