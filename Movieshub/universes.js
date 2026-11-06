export const universes = [
  { id: 'marvel', label: 'Marvel Cinematic Universe', pattern: /\b(?:marvel|mcu)\b/i },
  { id: 'ssu', label: "Sony's Spider-Man Universe (SSU)", pattern: /\b(?:ssu|sony(?:[’']s)?(?:[\s-]+spider[\s-]?man)?)\b/i },
  { id: 'dc', label: 'DC Universe', pattern: /\b(?:dc|dcu|dceu)\b/i },
  { id: 'x-men', label: 'X-Men', pattern: /\bx[\s-]?men\b/i },
];

// Media type remains in `categories`; universe tags can name multiple universes.
export function getUniverseTags(movie) {
  return [movie.universe, movie.universes, movie.category]
    .flat()
    .filter(value => typeof value === 'string')
    .join(' ');
}

export function matchesUniverse(movie, universeId) {
  const universe = universes.find(item => item.id === universeId);
  return Boolean(universe?.pattern.test(getUniverseTags(movie)));
}
