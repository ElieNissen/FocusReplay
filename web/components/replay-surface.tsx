'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ReplayMediaCache } from '@/lib/replay-cache';

export default function ReplaySurface({
  cache,
  mediaKey,
  fallbackKey,
  alt,
  revision,
}: {
  cache: ReplayMediaCache;
  mediaKey: string;
  fallbackKey?: string;
  alt: string;
  revision: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const displayed = useRef('');
  const [state, setState] = useState<'ready' | 'preview' | 'loading' | 'error'>('loading');
  useLayoutEffect(() => {
    let active = true;
    const draw = (image: HTMLImageElement, key: string) => {
      if (!active || !canvas.current) return;
      const el = canvas.current;
      // Resize and paint in one task; the browser never presents an empty intermediate frame.
      if (el.width !== image.naturalWidth) el.width = image.naturalWidth;
      if (el.height !== image.naturalHeight) el.height = image.naturalHeight;
      el.getContext('2d')?.drawImage(image, 0, 0, el.width, el.height);
      displayed.current = key;
      setState(key === mediaKey ? 'ready' : 'preview');
    };
    if (displayed.current && !cache.peek(displayed.current)) {
      canvas.current
        ?.getContext('2d')
        ?.clearRect(0, 0, canvas.current.width, canvas.current.height);
      displayed.current = '';
    }
    const exact = cache.entries.get(mediaKey)?.image;
    if (exact) draw(exact, mediaKey);
    else {
      setState(displayed.current ? 'preview' : 'loading');
      const fallback = fallbackKey && cache.entries.get(fallbackKey)?.image;
      if (fallback) draw(fallback, fallbackKey!);
      void cache
        .decoded(mediaKey)
        .then((image) => draw(image, mediaKey))
        .catch(() => {
          if (active) setState(displayed.current ? 'preview' : 'error');
        });
    }
    return () => {
      active = false;
    };
  }, [cache, mediaKey, fallbackKey, revision]);
  return (
    <div
      className={'replay-surface ' + (state === 'preview' ? 'is-preview' : '')}
      data-state={state}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={state === 'ready' ? alt : 'Aperçu proche, capture exacte en chargement'}
      />
      {state === 'preview' && (
        <span className="surface-hint">Aperçu · chargement de la capture</span>
      )}
      {state === 'loading' && <span className="surface-hint">Chargement…</span>}
      {state === 'error' && <span className="surface-hint">Image non reçue</span>}
    </div>
  );
}
