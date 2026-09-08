const CATEGORY = {
  work: 'Travail',
  distraction: 'Loisir',
  unknown: 'Indéterminé',
  idle: 'Inactivité',
};
const COLORS = { work: '8BBB6D', distraction: '7198F4', unknown: '9F9488', idle: '69645F' };
function safeText(text) {
  return String(text ?? '')
    .replace(/[\\{}\r\n]/g, ' ')
    .slice(0, 160);
}
function assTime(seconds) {
  const c = Math.round(seconds * 100);
  return `${Math.floor(c / 360000)}:${String(Math.floor(c / 6000) % 60).padStart(2, '0')}:${String(Math.floor(c / 100) % 60).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`;
}
function clock(at) {
  return new Date(at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
function duration(ms) {
  return ms < 60000 ? Math.round(ms / 1000) + ' s' : Math.round(ms / 60000) + ' min';
}
function exportName(frames, session = false) {
  const first = new Date(frames[0].at),
    last = new Date(frames.at(-1).at);
  const date = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`;
  const hour = (d) =>
    `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
  return `FocusReplay - ${session ? 'Session' : 'Journee'} du ${date} - ${hour(first)} a ${hour(last)}.mp4`;
}
function makeSubtitles(frames, fps, activity = []) {
  if (!frames.length) return '';
  const header =
    '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,24,&H00F3F0EB,&H00F3F0EB,&H001C1C1B,&H001C1C1B,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  const start = frames[0].at;
  const end = Math.max(start + 1, frames.at(-1).at, ...activity.map((a) => a.to));
  const span = end - start,
    length = frames.length / fps,
    lines = [];
  const x = (at) => 32 + 1856 * Math.max(0, Math.min(1, (at - start) / span));
  const event = (from, to, body, layer = 1) =>
    lines.push(`Dialogue: ${layer},${assTime(from)},${assTime(to)},Default,,0,0,0,,${body}`);
  const text = (from, to, left, top, size, body, color = 'F3F0EB', bold = 0) =>
    event(
      from,
      to,
      `{\\an7\\pos(${Math.round(left)},${top})\\fs${size}\\b${bold}\\1c&H${color}&}${safeText(body)}`,
    );
  const rect = (from, to, left, top, w, h, color, layer = 0) =>
    event(
      from,
      to,
      `{\\an7\\pos(${Math.round(left)},${top})\\p1\\1c&H${color}&}m 0 0 l ${Math.max(1, Math.round(w))} 0 l ${Math.max(1, Math.round(w))} ${h} l 0 ${h}{\\p0}`,
      layer,
    );
  const observed = activity.length
    ? activity
    : frames.map((f, i) => ({
        app: f.app,
        category: f.category,
        from: f.at,
        to: frames[i + 1]?.at || end,
        ms: (frames[i + 1]?.at || end) - f.at,
      }));
  const raw = observed
    .filter((a) => a.to > start && a.from < end)
    .map((a) => ({
      ...a,
      from: Math.max(start, a.from),
      to: Math.min(end, a.to),
      ms:
        ((a.ms ?? a.to - a.from) * (Math.min(end, a.to) - Math.max(start, a.from))) /
        Math.max(1, a.to - a.from),
    }));
  const clipped = [];
  for (const a of raw.sort((a, b) => a.from - b.from)) {
    const last = clipped.at(-1);
    if (last && last.app === a.app && last.category === a.category && a.from - last.to < 1000) {
      last.to = Math.max(last.to, a.to);
      last.ms += a.ms;
    } else clipped.push({ ...a });
  }
  const totals = {};
  for (const a of clipped)
    totals[a.category || 'unknown'] = (totals[a.category || 'unknown'] || 0) + a.ms;
  let legendX = 32;
  for (const [category, ms] of Object.entries(totals)) {
    rect(0, length, legendX, 871, 8, 8, COLORS[category]);
    text(0, length, legendX + 18, 860, 24, `${CATEGORY[category]}  ${duration(ms)}`);
    legendX += 300;
  }
  rect(0, length, 32, 910, 1856, 12, '393532');
  for (const a of clipped) {
    rect(0, length, x(a.from), 910, x(a.to) - x(a.from), 12, COLORS[a.category] || COLORS.unknown);
    rect(0, length, x(a.from), 938, Math.max(2, x(a.to) - x(a.from) - 2), 32, '393532');
    if (x(a.to) - x(a.from) > Math.max(90, a.app.length * 11))
      text(0, length, x(a.from) + 6, 942, 19, a.app);
  }
  for (let i = 0; i < 5; i++)
    text(
      0,
      length,
      Math.min(1790, x(start + (span * i) / 4)),
      994,
      22,
      clock(start + (span * i) / 4).slice(0, 5),
      'B6ADA2',
    );
  // Map foreground transitions between photos onto the same video clock.
  const videoTime = (at) => {
    let lo = 0,
      hi = frames.length - 1;
    while (lo < hi) {
      const m = Math.ceil((lo + hi) / 2);
      if (frames[m].at <= at) lo = m;
      else hi = m - 1;
    }
    const next = frames[lo + 1]?.at || end;
    return Math.max(
      0,
      Math.min(
        length,
        (lo + Math.max(0, Math.min(1, (at - frames[lo].at) / Math.max(1, next - frames[lo].at)))) /
          fps,
      ),
    );
  };
  for (const a of activity.length ? clipped : []) {
    const from = videoTime(a.from),
      to = videoTime(a.to);
    if (to <= from) continue;
    text(from, to, 420, 24, 34, a.app, 'F3F0EB', 1);
    text(
      from,
      to,
      420,
      65,
      20,
      `${CATEGORY[a.category] || CATEGORY.unknown} · ${duration(a.ms)}`,
      COLORS[a.category] || COLORS.unknown,
    );
  }
  frames.forEach((f, i) => {
    const from = i / fps,
      to = (i + 1) / fps,
      next = frames[i + 1]?.at || end;
    text(from, to, 32, 18, 44, clock(f.at), 'F3F0EB', 1);
    text(from, to, 32, 65, 20, new Date(f.at).toLocaleDateString('fr-FR'), 'B6ADA2');
    if (!activity.length || !clipped.some((a) => a.from <= f.at && a.to > f.at)) {
      text(from, to, 420, 24, 34, f.app, 'F3F0EB', 1);
      text(
        from,
        to,
        420,
        65,
        20,
        CATEGORY[f.category] || CATEGORY.unknown,
        COLORS[f.category] || COLORS.unknown,
      );
    }
    const previous = frames[i - 1];
    if (
      previous &&
      (f.sessionId !== previous.sessionId ||
        f.at - previous.at > (previous.interval || 60) * 1800 ||
        (f.events || []).some(
          (e) =>
            ['pause', 'system-pause', 'capture-error'].includes(e.type) &&
            e.at > previous.at &&
            e.at <= f.at,
        ))
    )
      text(from, to, 1320, 65, 18, 'Après une interruption', 'B6ADA2');
    event(
      from,
      to,
      `{\\an7\\move(${Math.round(x(f.at))},899,${Math.round(x(next))},899)\\p1\\1c&H7198F4&}m 0 0 l 3 0 l 3 80 l 0 80{\\p0}`,
      3,
    );
  });
  return header + lines.join('\n');
}
module.exports = { makeSubtitles, safeText, exportName };
