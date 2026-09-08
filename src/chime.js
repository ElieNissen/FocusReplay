export function playChime() {
  try {
    const context = new AudioContext();
    context
      .resume()
      .then(() => {
        [523.25, 659.25, 783.99].forEach((frequency, i) => {
          const oscillator = context.createOscillator(),
            gain = context.createGain(),
            start = context.currentTime + i * 0.19;
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + 0.65);
        });
        setTimeout(() => context.close(), 1800);
      })
      .catch(() => context.close());
  } catch {
    /* The Windows notification remains available if audio is unavailable. */
  }
}
