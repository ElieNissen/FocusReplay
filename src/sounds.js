import { useEffect } from 'react';
let settings = { soundEnabled: true, soundVolume: 0.3 };
let last = 0;
export function playSound(kind = 'tap') {
  if (!settings.soundEnabled || settings.soundVolume <= 0) return;
  const now = Date.now();
  if (kind === 'tap' && now - last < 100) return;
  last = now;
  try {
    const context = new AudioContext();
    const notes =
      kind === 'reminder' ? [523.25, 659.25, 783.99] : kind === 'confirm' ? [520, 720] : [640];
    context
      .resume()
      .then(() => {
        notes.forEach((frequency, index) => {
          const oscillator = context.createOscillator(),
            gain = context.createGain();
          const start = context.currentTime + index * 0.15;
          const length = kind === 'reminder' ? 0.55 : 0.12;
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(frequency, start);
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(settings.soundVolume * 0.12, start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
          oscillator.start(start);
          oscillator.stop(start + length + 0.02);
        });
        setTimeout(() => context.close().catch(() => {}), 1300);
      })
      .catch(() => context.close().catch(() => {}));
  } catch {
    /* Audio availability must never block an action. */
  }
}
export function useSoundDesign(value) {
  useEffect(() => {
    if (value) settings = value;
  }, [value]);
  useEffect(() => {
    const click = (event) => {
      const control = event.target.closest?.(
        'button, summary, [role="button"], input[type="checkbox"]',
      );
      if (control && !control.disabled && control.getAttribute('aria-disabled') !== 'true')
        playSound();
    };
    const change = (event) => {
      if (event.target.matches?.('select, input[type="range"]')) playSound();
    };
    const key = (event) => {
      if (
        !['Space', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyD'].includes(event.code) ||
        event.repeat
      )
        return;
      queueMicrotask(() => {
        if (event.defaultPrevented) playSound();
      });
    };
    window.addEventListener('keydown', key);
    document.addEventListener('click', click);
    document.addEventListener('change', change);
    return () => {
      window.removeEventListener('keydown', key);
      document.removeEventListener('click', click);
      document.removeEventListener('change', change);
    };
  }, []);
}
