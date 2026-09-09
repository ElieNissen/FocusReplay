import { useEffect, useRef, useState } from 'react';
const api = window.focusReplay;
export function useMusic(ready, widget) {
  const audio = useRef(null),
    current = useRef(null),
    timer = useRef(null);
  const [musicStatus, setStatus] = useState({ playing: false });
  const musicEnded = (error = false) => {
    clearInterval(timer.current);
    audio.current?.pause();
    const id = current.current;
    current.current = null;
    if (id) api.musicDone(id, error === true).catch(() => {});
  };
  useEffect(() => {
    if (!api || widget || !ready) return;
    const offStatus = api.onMusicStatus(setStatus);
    const offCommand = api.onMusicCommand(async (command) => {
      if (command.type === 'stop') {
        if (current.current === command.id) musicEnded();
        return;
      }
      musicEnded();
      current.current = command.id;
      if (!audio.current) return musicEnded(true);
      audio.current.src = command.src;
      audio.current.volume = command.volume;
      audio.current.currentTime = 0;
      audio.current.loop = false;
      try {
        await audio.current.play();
        if (current.current !== command.id) {
          audio.current?.pause();
          return;
        }
        if (command.seconds)
          timer.current = setInterval(() => {
            if (audio.current.currentTime >= command.seconds) musicEnded();
          }, 100);
      } catch {
        if (current.current === command.id) musicEnded(true);
      }
    });
    api
      .musicState()
      .then(setStatus)
      .catch(() => {});
    api.musicReady().catch(() => {});
    return () => {
      offStatus();
      offCommand();
      musicEnded();
    };
  }, [ready, widget]);
  return {
    audio,
    musicStatus,
    musicPlaying: musicStatus.playing,
    stopMusic: () => api.musicStop().catch(() => {}),
    playMusic: () => api.musicPreview('local').catch(() => {}),
    musicEnded,
  };
}
