const { randomUUID } = require('node:crypto');

class Checkins {
  constructor({ recorder, present, close, showMain, now = Date.now }) {
    Object.assign(this, { recorder, present, close, showMain, now });
    this.pending = null;
    this.lastPrompt = 0;
  }
  state() {
    return {
      prompt: this.pending,
      settings: {
        theme: this.recorder.data.settings.theme,
        soundEnabled: this.recorder.data.settings.soundEnabled,
        soundVolume: this.recorder.data.settings.soundVolume,
      },
    };
  }
  clear() {
    this.pending = null;
    this.close();
  }
  sync() {
    const s = this.recorder.active,
      p = this.pending;
    if (
      p &&
      (!s ||
        s.id !== p.sessionId ||
        this.recorder.systemPaused ||
        this.now() - p.at > 10 * 60000 ||
        (p.kind === 'reason' ? s.status !== 'paused' : s.status !== 'recording'))
    )
      this.clear();
  }
  request(kind = 'work', force = false) {
    this.sync();
    const s = this.recorder.active;
    if (
      !s ||
      s.status !== 'recording' ||
      this.recorder.systemPaused ||
      this.pending ||
      (!force && this.now() - this.lastPrompt < 10 * 60000)
    )
      return false;
    const last = s.activity.at(-1);
    this.pending = {
      id: randomUUID(),
      sessionId: s.id,
      at: this.now(),
      kind,
      app: last?.app || '',
      domain: last?.domain || '',
    };
    this.lastPrompt = this.now();
    this.present(this.pending, kind === 'drift');
    return true;
  }
  async respond(id, action, text = '') {
    this.sync();
    const p = this.pending;
    if (!p || p.id !== id) throw new Error('Ce rappel n’est plus actif.');
    if (!['answer', 'pause', 'dismiss'].includes(action)) throw new Error('Action invalide.');
    if (typeof text !== 'string' || text.length > 500)
      throw new Error('Réponse limitée à 500 caractères.');
    if (action === 'answer' && !text.trim())
      throw new Error('Écrivez une réponse ou choisissez Plus tard.');
    // Claim the prompt before awaiting disk I/O: double clicks cannot pause twice.
    this.pending = null;
    try {
      await this.recorder.recordCheckin(p, action, text);
    } catch (error) {
      this.pending = p;
      this.sync();
      throw error;
    }
    this.close();
    if (action === 'pause') {
      this.showMain();
      if (
        (!text.trim() || p.kind === 'work') &&
        this.recorder.active?.id === p.sessionId &&
        !this.recorder.systemPaused
      ) {
        this.pending = { ...p, id: randomUUID(), at: this.now(), kind: 'reason' };
        this.present(this.pending, true, true);
      }
    }
    return this.state();
  }
}

function attachNotification(notification, prompt, { respond, overlay, fail }) {
  notification.on('reply', (event, legacy) => {
    respond(prompt.id, 'answer', event.reply ?? legacy ?? '').catch(fail);
  });
  notification.on('action', (event, legacy) => {
    if ((event.actionIndex ?? legacy) === 0) respond(prompt.id, 'pause').catch(fail);
  });
  notification.on('click', () => overlay(prompt.id));
  notification.on('failed', () => overlay(prompt.id));
  notification.show();
}
module.exports = { Checkins, attachNotification };
