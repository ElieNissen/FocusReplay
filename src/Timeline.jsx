import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, MessageCircle, EyeOff, X } from 'lucide-react';
import { shortTime, duration } from './lib.mjs';
import { groupActivity, groupMarkers } from './activity-overview.mjs';
import AppIcon from './AppIcon';
export default function Timeline({
  frames,
  totals,
  checkins = [],
  segments,
  gaps = [],
  icons = {},
  start,
  end,
  cursor,
  zoom,
  setZoom,
  seek,
  settings,
  onRule,
  onPrivacy,
}) {
  const scroll = useRef(null),
    anchor = useRef(null),
    wheelAnchor = useRef(false),
    latest = useRef({});
  const [viewport, setViewport] = useState(900),
    [shownZoom, setShownZoom] = useState(zoom);
  const [group, setGroup] = useState(null),
    [editing, setEditing] = useState(null);
  const [markerSelection, setMarkerSelection] = useState(null);
  const span = Math.max(1, end - start),
    base = Math.min(viewport, Math.max(280, frames.length * 96));
  const width = base * shownZoom;
  latest.current = { width, zoom, shownZoom };
  useEffect(() => {
    const el = scroll.current;
    const observer = new ResizeObserver(() => setViewport(el.clientWidth));
    observer.observe(el);
    const wheel = (e) => {
      if (e.shiftKey) return;
      e.preventDefault();
      const x = e.clientX - el.getBoundingClientRect().left;
      wheelAnchor.current = true;
      anchor.current = { ratio: (el.scrollLeft + x) / latest.current.width, x };
      setZoom((z) => Math.max(1, Math.min(8, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', wheel);
    };
  }, [setZoom]);
  useEffect(() => {
    const el = scroll.current;
    if (!wheelAnchor.current)
      anchor.current = { ratio: (cursor - start) / span, x: el.clientWidth / 2 };
    wheelAnchor.current = false;
    const from = latest.current.shownZoom,
      began = performance.now();
    let frame;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = (now) => {
      const p = reduced ? 1 : Math.min(1, (now - began) / 180);
      setShownZoom(from + (zoom - from) * (1 - (1 - p) ** 3));
      if (p < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [zoom]);
  useLayoutEffect(() => {
    if (anchor.current) scroll.current.scrollLeft = anchor.current.ratio * width - anchor.current.x;
  }, [width]);
  useEffect(() => {
    if (Math.abs(cursor - end) < 1000) scroll.current.scrollLeft = width;
  }, [cursor, end, width]);
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') {
        setEditing(null);
        setGroup(null);
        setMarkerSelection(null);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  useEffect(() => {
    const main = scroll.current.closest('main');
    main?.style.setProperty('--timeline-height', '245px');
    return () => main?.style.removeProperty('--timeline-height');
  }, []);
  const groups = useMemo(
    () => groupActivity(segments, start, end, base * zoom, gaps),
    [segments, start, end, base, zoom, gaps],
  );
  const stride = Math.max(
    1,
    2 ** Math.ceil(Math.log2(Math.max(1, frames.length / Math.max(1, (base * zoom) / 100)))),
  );
  const samples = frames.filter((_, i) => i % stride === 0);
  const markers = groupMarkers(checkins, start, end, base * zoom);
  const position = (from, to) => ({
    left: ((from - start) / span) * width,
    width: Math.max(0, ((to - from) / span) * width),
  });
  return (
    <section className="timeline-section overview-timeline" aria-label="Timeline interactive">
      {markerSelection && (
        <div
          className="marker-detail overview-detail"
          role="region"
          aria-label="Repères sélectionnés"
        >
          <button
            className="icon-button"
            aria-label="Fermer les repères"
            onClick={() => setMarkerSelection(null)}
          >
            <X size={16} />
          </button>
          {markerSelection.map((e) => (
            <button key={e.id} onClick={() => seek(e.at)}>
              <time>{shortTime(e.at)}</time>
              <span>{e.text || 'Arrêt du travail'}</span>
            </button>
          ))}
        </div>
      )}
      {editing && (
        <div
          className="timeline-rule overview-detail"
          role="region"
          aria-label="Classement depuis la timeline"
        >
          {group && (
            <div className="group-breakdown">
              {group.apps.map((a) => (
                <button key={a.app + a.domain + a.category} onClick={() => setEditing(a)}>
                  <AppIcon name={a.app} icons={icons} />
                  <span>{a.domain || a.app}</span>
                  <strong>{duration(a.ms)}</strong>
                </button>
              ))}
            </div>
          )}
          <strong>{editing.domain || editing.app}</strong>
          {onPrivacy &&
            [
              ['privateApps', editing.app.toLowerCase()],
              ...(editing.domain ? [['privateDomains', editing.domain]] : []),
            ].map(([key, value]) => (
              <button key={key} onClick={() => onPrivacy(key, value)}>
                {settings[key]?.includes(value) ? 'Ne plus masquer' : 'Masquer'} {value} dans le
                partage
              </button>
            ))}
          {[
            ['appRules', editing.app.toLowerCase(), editing.app],
            ...(editing.domain ? [['siteRules', editing.domain, editing.domain]] : []),
          ].map(([key, value, label]) => (
            <label key={key}>
              {label}
              <select
                aria-label={'Classement · ' + label}
                value={settings[key]?.[value] || 'auto'}
                onChange={(e) => onRule(key, value, e.target.value)}
              >
                <option value="auto">Automatique</option>
                <option value="work">Travail</option>
                <option value="distraction">Loisir</option>
                <option value="unknown">Indéterminé</option>
              </select>
            </label>
          ))}
          <button
            onClick={() => {
              setEditing(null);
              setGroup(null);
            }}
            aria-label="Fermer le classement"
          >
            ×
          </button>
        </div>
      )}
      <div className="timeline-toolbar">
        <div className="time-totals">
          <strong>{duration(totals?.active || 0)} hors pauses</strong>
          <span>Pauses · {duration(totals?.paused || 0)}</span>
        </div>
        <div className="inline-slider zoom-control">
          <button
            aria-label="Dézoomer la timeline"
            onClick={() => setZoom(Math.max(1, zoom / 1.25))}
          >
            <ZoomOut size={16} />
          </button>
          <input
            aria-label="Zoom de la timeline"
            type="range"
            min="1"
            max="8"
            step="0.1"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <button aria-label="Zoomer la timeline" onClick={() => setZoom(Math.min(8, zoom * 1.25))}>
            <ZoomIn size={16} />
          </button>
        </div>
      </div>
      <div
        className="timeline-scroll"
        ref={scroll}
        title="Molette : zoom · Maj + molette : défilement · Q/D ou flèches : image précédente/suivante"
      >
        <div className="timeline-inner" style={{ width, height: checkins.length ? 224 : 184 }}>
          <div className="ruler">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i}>{shortTime(start + (span * i) / 8)}</span>
            ))}
          </div>
          <div className="filmstrip">
            {samples.map((f, i) => (
              <img
                key={f.id}
                src={'focusmedia://capture/' + f.id}
                alt=""
                draggable="false"
                style={position(f.at, samples[i + 1]?.at || end)}
              />
            ))}
            {gaps.map((g, i) => (
              <div
                key={i}
                className="timeline-gap"
                style={position(g.from, g.to)}
                title={g.label + ' · ' + duration(g.to - g.from)}
              >
                <span>{g.label}</span>
              </div>
            ))}
            {groupMarkers(
              frames.filter((f) => f.sharedPrivate),
              start,
              end,
              base * zoom,
              28,
            ).map((m) => (
              <span
                key={'private-' + m.entries[0].id}
                className="timeline-private"
                title={m.entries.length + ' capture(s) masquée(s) dans le partage en ligne'}
                style={{ left: (m.x * shownZoom) / zoom }}
              >
                <EyeOff size={13} />
              </span>
            ))}
          </div>
          <div className="activity-track" aria-hidden="true">
            {segments.map((a, i) => (
              <span
                key={i}
                className={a.category || 'unknown'}
                style={position(Math.max(start, a.from), Math.min(end, a.to))}
              />
            ))}
          </div>
          <div className="overview-lane" aria-label="Logiciels utilisés sur la timeline">
            {groups.map((g) => {
              const a = g.apps[0],
                px = ((g.to - g.from) / span) * width;
              return (
                <button
                  key={g.from}
                  className={'overview-block ' + a.category}
                  style={position(g.from, g.to)}
                  aria-label={
                    g.apps.map((r) => r.domain || r.app).join(', ') +
                    ' · ' +
                    duration(g.apps.reduce((n, r) => n + r.ms, 0))
                  }
                  title={
                    shortTime(g.from) +
                    '–' +
                    shortTime(g.to) +
                    '\n' +
                    g.apps.map((r) => (r.domain || r.app) + ' · ' + duration(r.ms)).join('\n')
                  }
                  onClick={() => {
                    seek(g.from);
                    setGroup(g);
                    setEditing(a);
                    setMarkerSelection(null);
                  }}
                >
                  {px > 35 && (
                    <div className="group-icons">
                      {g.apps.slice(0, px > 160 ? 3 : 1).map((r, i) => (
                        <AppIcon key={i} name={r.app} icons={icons} />
                      ))}
                    </div>
                  )}
                  {g.apps.some((r) => r.sharedPrivate) && px > 65 && (
                    <EyeOff size={12} aria-label="Contient des éléments masqués en ligne" />
                  )}
                  {px > 90 && (
                    <span>
                      <strong>
                        {g.apps.length > 1
                          ? g.apps
                              .slice(0, 2)
                              .map((r) => r.domain || r.app)
                              .join(' + ')
                          : a.domain || a.app}
                      </strong>
                      <small>
                        {g.apps.length > 1
                          ? g.apps.length + ' activités · détails'
                          : duration(a.ms)}
                      </small>
                    </span>
                  )}
                </button>
              );
            })}
            {gaps.map((g, i) => (
              <div key={i} className="overview-gap" style={position(g.from, g.to)} />
            ))}
          </div>
          {markers.map((m) => {
            const e = m.entries[0];
            return (
              <button
                key={e.id}
                className="timeline-note"
                style={{
                  left: (m.x * shownZoom) / zoom,
                }}
                title={m.entries
                  .map((e) => shortTime(e.at) + ' · ' + (e.text || 'Arrêt du travail'))
                  .join('\n')}
                aria-label={'Repère à ' + shortTime(e.at)}
                onClick={() => {
                  seek(e.at);
                  setEditing(null);
                  setMarkerSelection(m.entries);
                }}
              >
                <MessageCircle size={13} />
                <span>
                  {m.entries.length > 1
                    ? m.entries.length + ' repères'
                    : e.text || 'Arrêt du travail'}
                </span>
              </button>
            );
          })}
          <div className="playhead" style={{ left: ((cursor - start) / span) * width }}>
            <span />
          </div>
          <input
            className="scrubber"
            aria-label="Curseur de la timeline"
            type="range"
            min={start}
            max={end}
            step="1"
            value={cursor}
            onChange={(e) => seek(Number(e.target.value))}
          />
        </div>
      </div>
    </section>
  );
}
