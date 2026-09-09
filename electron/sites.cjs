function domainOnly(value) {
  if (typeof value !== 'string' || value.length > 4096) return '';
  try {
    const url = new URL(value.includes('://') ? value : 'https://' + value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    const host = url.hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/\.$/, '');
    return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : '';
  } catch {
    return '';
  }
}
function siteCategory(domain) {
  const matches = (names) => names.some((name) => domain === name || domain.endsWith('.' + name));
  if (
    matches([
      'github.com',
      'docs.google.com',
      'figma.com',
      'notion.so',
      'stackoverflow.com',
      'learn.microsoft.com',
    ])
  )
    return 'work';
  if (
    matches([
      'netflix.com',
      'twitch.tv',
      'tiktok.com',
      'instagram.com',
      'facebook.com',
      'reddit.com',
    ])
  )
    return 'distraction';
  if (matches(['youtube.com', 'google.com'])) return 'unknown';
  return undefined;
}
module.exports = { domainOnly, siteCategory };
