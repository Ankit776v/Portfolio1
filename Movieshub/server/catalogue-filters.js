const GENRES = {
  movie: [28,12,16,35,80,99,18,10751,14,36,27,10402,9648,10749,878,10770,53,10752,37],
  tv: [10759,16,35,80,99,18,10751,10762,9648,10763,10764,10765,10766,10767,10768,37],
};
function parseFilters(query = {}, type = 'movie') {
  const result = {};
  for (const key of ['originalLanguage','genre','year','minRating','sort']) {
    const value = query[key] ?? '';
    if (typeof value !== 'string' || value.length > 20) throw Object.assign(new Error('Invalid catalogue filters.'), { status:400 });
    result[key] = value.trim();
  }
  if ((result.originalLanguage && !/^[a-z]{2}$/.test(result.originalLanguage)) ||
      (result.genre && (!/^\d+$/.test(result.genre) || !GENRES[type].includes(Number(result.genre)))) ||
      (result.year && (!/^\d{4}$/.test(result.year) || Number(result.year) < 1870 || Number(result.year) > new Date().getUTCFullYear() + 10)) ||
      (result.minRating && (!/^\d+(?:\.\d)?$/.test(result.minRating) || Number(result.minRating) > 10)) ||
      !['','popular','rating','newest','oldest'].includes(result.sort)) {
    throw Object.assign(new Error('Choose a valid language, genre, year, minimum rating, and sort order.'), { status:400 });
  }
  return result;
}
function applyFilters(query, { kind, day, kids, filters }) {
  const tv = kind.startsWith('series-'), type = tv ? 'tv' : 'movie';
  const active = Object.values(filters).some(Boolean) || kids || kind === 'discover-movies' || kind === 'series-discover';
  if (!active) return query;
  const { params } = query;
  query.resource = '/discover/' + type;
  if (tv) params.set('include_null_first_air_dates','false');
  const sort = filters.sort || (kind.includes('top-rated') ? 'rating' : 'popular');
  params.set('sort_by', { popular:'popularity.desc',rating:'vote_average.desc',newest:tv?'first_air_date.desc':'primary_release_date.desc',oldest:tv?'first_air_date.asc':'primary_release_date.asc' }[sort]);
  if (sort === 'rating' || filters.minRating) params.set('vote_count.gte', tv ? '100' : '300');
  if (filters.originalLanguage) params.set('with_original_language',filters.originalLanguage);
  if (filters.genre) params.set('with_genres',filters.genre);
  else if (kids) params.set('with_genres',tv?'10751|10762|16':'10751|16');
  if (filters.year) params.set(tv?'first_air_date_year':'primary_release_year',filters.year);
  if (filters.minRating) params.set('vote_average.gte',filters.minRating);
  if (kind === 'now-playing') {
    const since = new Date(day+'T12:00:00Z'); since.setUTCDate(since.getUTCDate()-60);
    params.set('with_release_type','3|2'); params.set('release_date.gte',since.toISOString().slice(0,10)); params.set('release_date.lte',day);
  }
  return query;
}
module.exports = { parseFilters, applyFilters };
