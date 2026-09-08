import { useEffect, useRef, useState } from 'react';

// Own the only camera stream in the main renderer. No microphone is requested.
export function useCamera(data, widget) {
  const [status, setStatus] = useState('off');
  const resources = useRef({ stream: null, opening: null, generation: 0 });
  const enabled = Boolean(
    !widget &&
    data?.settings.cameraEnabled &&
    data.sessions.some((s) => !s.endedAt && s.status === 'recording') &&
    !data.systemPaused,
  );
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const stop = () => {
    const r = resources.current;
    r.generation++;
    r.stream?.getTracks().forEach((t) => t.stop());
    r.stream = null;
    r.opening = null;
    setStatus('off');
  };
  const ensureStream = async () => {
    const r = resources.current;
    if (!enabledRef.current) throw new Error('Camera disabled');
    if (r.stream?.active) return r.stream;
    if (r.opening) return r.opening;
    const generation = r.generation;
    setStatus('opening');
    r.opening = navigator.mediaDevices
      .getUserMedia({ audio: false, video: true })
      .then((stream) => {
        if (!enabledRef.current || generation !== r.generation) {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error('Camera disabled');
        }
        r.stream = stream;
        setStatus('ready');
        return stream;
      })
      .catch((error) => {
        if (generation === r.generation) setStatus('error');
        throw error;
      })
      .finally(() => {
        if (generation === r.generation) r.opening = null;
      });
    return r.opening;
  };
  useEffect(() => {
    if (!enabled) stop();
    else ensureStream().catch(() => {});
  }, [enabled]);
  useEffect(() => {
    if (widget || !window.focusReplay) return;
    const offRequest = window.focusReplay.onCameraRequest(async (requestId) => {
      let bitmap;
      try {
        const stream = await ensureStream();
        const generation = resources.current.generation;
        bitmap = await new ImageCapture(stream.getVideoTracks()[0]).grabFrame();
        if (!enabledRef.current || generation !== resources.current.generation)
          throw new Error('Camera disabled');
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 640 / bitmap.width, 640 / bitmap.height);
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        await window.focusReplay.cameraFrame({
          requestId,
          jpeg: canvas.toDataURL('image/jpeg', 0.65),
        });
        if (enabledRef.current) setStatus('ready');
      } catch (error) {
        if (enabledRef.current) setStatus('error');
        await window.focusReplay
          .cameraFrame({ requestId, jpeg: null, error: error?.name || 'Error' })
          .catch(() => {});
      } finally {
        bitmap?.close();
      }
    });
    const offStop = window.focusReplay.onCameraStop(stop);
    return () => {
      offRequest();
      offStop();
      stop();
    };
  }, []);
  return status;
}
