import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { shortTime, duration, frameAt } from './lib.mjs';
import { placeLabels } from './timeline-layout.mjs';

export default function Timeline({
  frames,
  segments,
  start,
  end,
  cursor,
  zoom,
  setZoom,
  seek,
  settings,
  onRule,
}) {
  const scroll = useRef(null);
  const [editing, setEditing] = useState(null);
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') setEditing(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const [viewport, setViewport] = useState(900);
  const [offset, setOffset] = useState(0);
  const span = Math.max(1, end - start);
  const width = Math.min(viewport, Math.max(180, frames.length * 96)) * zoom;
  const latest = useRef({});
  latest.current = { zoom, width, viewport };
  useEffect(() => {
    const el = scroll.current;
    const observer = new ResizeObserver(() => setViewport(el.clientWidth));
    observer.observe(el);
    const wheel = (event) => {
      if (event.shiftKey) return;
      event.preventDefault();
      const { zoom: z, width: w } = latest.current;
      const next = Math.max(1, Math.min(8, z * (event.deltaY < 0 ? 1.2 : 1 / 1.2)));
      const x = event.clientX - el.getBoundingClientRect().left;
      const ratio = (el.scrollLeft + x) / w;
      setZoom(next);
      requestAnimationFrame(() => {
        el.scrollLeft = (ratio * w * next) / z - x;
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', wheel);
    };
  }, [setZoom]);
  const visible = segments
    .filter((a) => a.to >= start && a.from <= end)
    .map((a) => ({
      ...a,
      label: a.domain || a.app,
      x: Math.max(0, ((a.from - start) / span) * width),
      width: Math.max(2, ((Math.min(end, a.to) - Math.max(start, a.from)) / span) * width),
    }));
  const layout = placeLabels(visible, width, offset, viewport);
  useEffect(() => {
    const main = scroll.current?.closest('main');
    main?.style.setProperty('--timeline-height', `${234 + layout.rows * 30}px`);
    return () => main?.style.removeProperty('--timeline-height');
  }, [layout.rows]);
  // A compact strip grows with the recording. Each tile represents its true timestamp.
  const tiles = useMemo(() => {
    const count = Math.max(1, Math.ceil(width / 96));
    return Array.from({ length: count }, (_, i) => ({
      frame: frameAt(frames, start + (span * i) / count),
      x: (i * width) / count,
      width: width / count,
    }));
  }, [frames, start, span, width]);
  const ticks = Math.max(2, Math.min(9, Math.floor(width / 130) + 1));
  return (
    <section className="timeline-section" aria-label="Timeline interactive">
      {editing && (
        <div className="timeline-rule" role="region" aria-label="Classement depuis la timeline">
          <strong>{editing.domain || editing.app}</strong>
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
          <button onClick={() => setEditing(null)} aria-label="Fermer le classement">
            ×
          </button>
        </div>
      )}
      <div className="timeline-toolbar">
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
        onScroll={(e) => setOffset(e.currentTarget.scrollLeft)}
        title="Molette : zoom · Maj + molette : défilement"
      >
        <div className="timeline-inner" style={{ width, height: 174 + layout.rows * 30 }}>
          <div className="ruler">
            {Array.from({ length: ticks }, (_, i) => (
              <span key={i}>{shortTime(start + (span * i) / (ticks - 1))}</span>
            ))}
          </div>
          <div className="filmstrip">
            {tiles.map(
              (tile, i) =>
                tile.frame && (
                  <img
                    key={i}
                    src={`focusmedia://capture/${tile.frame.id}`}
                    alt=""
                    loading="lazy"
                    draggable="false"
                    style={{ left: tile.x, width: tile.width + 1 }}
                  />
                ),
            )}
          </div>
          <div className="activity-track" aria-hidden="true">
            {visible.map((a, i) => (
              <span
                key={i}
                className={a.category || 'unknown'}
                style={{ left: a.x, width: a.width }}
              />
            ))}
          </div>
          <div
            className="software-lane"
            aria-label="Logiciels utilisés sur la timeline"
            style={{ height: 38 + layout.rows * 30 }}
          >
            {layout.items.map((a, i) => (
              <React.Fragment key={i}>
                <button
                  className={`software-segment ${a.category || 'unknown'}`}
                  style={{ left: a.x, width: a.width }}
                  aria-label={`${a.domain || a.app} · ${duration(a.ms)}`}
                  title={`${a.app} · ${shortTime(a.from)}–${shortTime(a.to)} · ${duration(a.ms)}`}
                  onClick={() => {
                    seek(Math.max(start, a.from));
                    setEditing(a);
                  }}
                >
                  {!a.callout && <span>{a.label}</span>}
                </button>
                {a.callout && (
                  <>
                    <span
                      className="label-leader"
                      style={{ left: a.x + a.width / 2, height: 13 + a.row * 30 }}
                    />
                    <button
                      className="software-callout"
                      style={{ left: a.labelX, top: 35 + a.row * 30, width: a.labelWidth }}
                      title={`${a.app} · ${duration(a.ms)}`}
                      onClick={() => {
                        seek(Math.max(start, a.from));
                        setEditing(a);
                      }}
                    >
                      <i className={a.category || 'unknown'} />
                      {a.label}
                      <small>{duration(a.ms)}</small>
                    </button>
                  </>
                )}
              </React.Fragment>
            ))}
          </div>
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
