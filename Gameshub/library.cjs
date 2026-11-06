const entries = require('./mlist.jsx');
const dossiers = require('./catalogue.json');
const identities = require('./identities.json');

function createLibrary(list = entries, details = dossiers) {
  if (!Array.isArray(list)) throw new Error('Gameshub/mlist.jsx must export an array of games.');
  const seen = new Set();
  return list.map((entry, index) => {
    const title = String(entry.title || entry.name || '').trim();
    const platforms = [...new Set((Array.isArray(entry.platforms) ? entry.platforms : [entry.platform]).filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
    if (!title) throw new Error(`Gameshub/mlist.jsx entry ${index + 1} needs a title.`);
    if (entry.year != null && (!Number.isInteger(entry.year) || entry.year < 1950 || entry.year > 2200)) throw new Error(`Invalid release year for ${title}.`);
    const slug = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const savedId = identities[JSON.stringify([title,entry.year??null,entry.franchise||'Other'])];
    const id = entry.id || (savedId && /^[a-z0-9][a-z0-9-]*$/.test(savedId) ? savedId : `${slug}${entry.year ? `-${entry.year}` : ''}`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || seen.has(id)) throw new Error(`Gameshub/mlist.jsx has an invalid or duplicate id: ${id}. Give this game a unique id.`);
    seen.add(id);
    if (entry.rawgId !== undefined && (!Number.isSafeInteger(entry.rawgId) || entry.rawgId <= 0)) throw new Error(`Invalid rawgId for ${title}. Use a positive RAWG game ID.`);
    if (entry.igdbId !== undefined && (!Number.isSafeInteger(entry.igdbId) || entry.igdbId <= 0)) throw new Error(`Invalid igdbId for ${title}. Use a positive IGDB game ID.`);
    const dossier = details.find(item => item.id === (entry.dossier || id));
    const franchise = entry.franchise || 'Other';
    const fallback = { Mario: 'mario.svg', Contra: 'contra.svg', GTA: 'gta.svg' }[franchise] || 'library.svg';
    const image = entry.image || dossier?.image || fallback;
    if (!/^[a-z0-9_.-]+$/i.test(image) && !/^https:\/\//i.test(image)) throw new Error(`Gameshub image for ${title} must be a local filename or HTTPS URL.`);
    return {
      ...dossier, ...entry, id, title, platforms, franchise, image,
      developer: entry.developer || dossier?.developer || 'Not listed',
      year: entry.year ?? dossier?.year ?? null,
      genre: entry.genre || dossier?.genre || 'Game',
      status: entry.status || (entry.year > new Date().getFullYear() ? 'Upcoming' : 'Not confirmed'),
      hasDossier: Boolean(dossier),
      tagline: entry.tagline || dossier?.tagline || `${franchise} / ${entry.subseries || entry.genre || 'Game library'}`,
      tone: entry.tone || dossier?.tone || 'Library record',
      accent: entry.accent || dossier?.accent || { Mario: '#ffae8c', Contra: '#aee5a1', GTA: '#c4a3ef' }[franchise] || '#c5ef83',
      release: entry.release || dossier?.release || (entry.year ? `${entry.year} (first release year)` : 'Not listed'),
      setting: entry.setting || dossier?.setting || 'This is a game-library entry with platform and release information. A spoiler-free setting guide has not been written yet.',
      history: entry.history || dossier?.history || 'A written development history has not been added for this entry yet.',
      timeline: entry.timeline || dossier?.timeline || (entry.year ? [[String(entry.year), title, 'First release year recorded in the library. Platforms may have released in different years or regions.']] : []),
      characters: dossier?.characters || [],
      story: dossier?.story || [],
      sources: dossier?.sources || [],
    };
  });
}
module.exports = { createLibrary };
