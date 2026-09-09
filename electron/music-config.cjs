const phases = ['launch', 'intro', 'session'];
const defaults = Object.fromEntries(
  phases.map((phase) => [
    phase,
    {
      enabled: phase === 'intro',
      source: 'local',
      mode: 'track',
      links: '',
      items: [],
    },
  ]),
);
function spotifyUri(value, kind) {
  let match = String(value)
    .trim()
    .match(/^spotify:(track|playlist):([a-zA-Z0-9]{22})$/);
  if (!match) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error('Collez un lien Spotify de titre ou de playlist.');
    }
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'open.spotify.com' ||
      url.username ||
      url.password
    )
      throw new Error('Utilisez un lien open.spotify.com.');
    match = url.pathname.match(/^\/(?:intl-[a-z]+\/)?(track|playlist)\/([a-zA-Z0-9]{22})\/?$/);
  }
  if (!match || match[1] !== kind)
    throw new Error(
      kind === 'track' ? 'Un lien de titre est attendu.' : 'Un lien de playlist est attendu.',
    );
  return `spotify:${match[1]}:${match[2]}`;
}
function selection(slot, random = Math.random) {
  const lines = slot.links.split(/\s+/).filter(Boolean);
  if (!lines.length) throw new Error('Ajoutez au moins un lien Spotify.');
  if (slot.mode !== 'selection' && lines.length !== 1)
    throw new Error('Indiquez un seul lien, ou choisissez Plusieurs titres.');
  if (lines.length > 100) throw new Error('Maximum 100 titres par sélection.');
  if (slot.mode === 'playlist') return { context_uri: spotifyUri(lines[0], 'playlist') };
  const uris = [...new Set(lines.map((line) => spotifyUri(line, 'track')))];
  for (let i = uris.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [uris[i], uris[j]] = [uris[j], uris[i]];
  }
  return { uris };
}
function validateMusic(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Réglages musique invalides.');
  return Object.fromEntries(
    phases.map((phase) => {
      const slot = value[phase];
      if (
        !slot ||
        typeof slot.enabled !== 'boolean' ||
        !['local', 'spotify'].includes(slot.source) ||
        !['track', 'selection', 'playlist'].includes(slot.mode) ||
        typeof slot.links !== 'string' ||
        slot.links.length > 15000
      )
        throw new Error('Réglages musique invalides.');
      const result = {
        enabled: slot.enabled,
        source: slot.source,
        mode: slot.mode,
        links: slot.links.trim(),
        items: [],
      };
      if (slot.items !== undefined) {
        if (!Array.isArray(slot.items) || slot.items.length > 100)
          throw new Error('Sélection invalide.');
        result.items = slot.items.map((item) => {
          if (
            !item ||
            typeof item.name !== 'string' ||
            item.name.length > 300 ||
            typeof item.subtitle !== 'string' ||
            item.subtitle.length > 500
          )
            throw new Error('Titre invalide.');
          const uri = spotifyUri(item.uri, slot.mode === 'playlist' ? 'playlist' : 'track');
          const image =
            typeof item.image === 'string' &&
            /^https:\/\/i\.scdn\.co\/image\/[a-zA-Z0-9]+$/.test(item.image)
              ? item.image
              : '';
          return { uri, name: item.name, subtitle: item.subtitle, image };
        });
      }
      if (result.source === 'spotify' && result.links) selection(result);
      return [phase, result];
    }),
  );
}
module.exports = { phases, defaults, selection, validateMusic, spotifyUri };
