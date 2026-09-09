// A separate queue keeps network/audio failures out of the recorder's write queue.
class MusicDirector {
  constructor({ settings, play, report }) {
    Object.assign(this, { settings, play, report });
    this.queue = Promise.resolve();
    this.sessionId = null;
    this.ready = false;
  }
  run(phases, overrides = {}) {
    this.abort?.abort();
    const abort = (this.abort = new AbortController());
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        for (const phase of phases) {
          if (abort.signal.aborted) return;
          const slot = overrides[phase] || this.settings().musicSlots[phase];
          if (!slot.enabled) continue;
          try {
            this.phase = phase;
            if ((await this.play(slot, abort.signal, phase)) === false) return;
          } catch (error) {
            if (!abort.signal.aborted) this.report(error.message);
          }
        }
      })
      .finally(() => {
        if (this.abort === abort) this.phase = null;
      });
    return this.queue;
  }
  open() {
    if (!this.ready) {
      this.ready = true;
      this.run(['launch']);
    }
  }
  observe(session, systemPaused) {
    if (!this.ready) return;
    const id = session?.id || null;
    const paused = Boolean(session && (session.status === 'paused' || systemPaused));
    if (id !== this.sessionId) {
      this.sessionId = id;
      this.paused = paused;
      if (id && !paused) this.run(['intro', 'session']);
      else this.stop();
    } else if (paused && !this.paused) this.stop();
    this.paused = paused;
  }
  stop() {
    this.abort?.abort();
    return this.queue;
  }
  changed() {
    if (this.phase && !this.settings().musicSlots[this.phase].enabled) this.stop();
  }
}
module.exports = { MusicDirector };
