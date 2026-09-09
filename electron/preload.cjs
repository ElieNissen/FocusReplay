const { contextBridge, ipcRenderer } = require('electron');
const methods = [
  'state',
  'musicState',
  'musicReady',
  'musicStop',
  'musicPreview',
  'musicDone',
  'spotifyConnect',
  'spotifyDisconnect',
  'spotifyDevices',
  'spotifySearch',
  'spotifyPlaylists',
  'spotifyResolve',
  'spotifyOpen',
  'spotifySetup',
  'screens',
  'start',
  'pause',
  'pauseFor',
  'stop',
  'settings',
  'pickMusic',
  'removeMusic',
  'deleteSession',
  'deleteFrame',
  'export',
  'cancelExport',
  'openExport',
  'openData',
  'showMain',
  'allowCamera',
  'cameraFrame',
  'saveReward',
  'deleteReward',
  'redeemReward',
  'finishBreak',
];
const api = Object.fromEntries(
  methods.map((method) => [method, (...args) => ipcRenderer.invoke('focus:' + method, ...args)]),
);
for (const [method, channel] of [
  ['onMusicStatus', 'music-status'],
  ['onMusicCommand', 'music-command'],
]) {
  api[method] = (callback) => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on('focus:' + channel, listener);
    return () => ipcRenderer.removeListener('focus:' + channel, listener);
  };
}
api.onChange = (callback) => {
  const listener = (_, data) => callback(data);
  ipcRenderer.on('focus:change', listener);
  return () => ipcRenderer.removeListener('focus:change', listener);
};
api.onExport = (callback) => {
  const listener = (_, data) => callback(data);
  ipcRenderer.on('focus:export', listener);
  return () => ipcRenderer.removeListener('focus:export', listener);
};
api.onCameraRequest = (callback) => {
  const listener = (_, id) => callback(id);
  ipcRenderer.on('focus:camera-request', listener);
  return () => ipcRenderer.removeListener('focus:camera-request', listener);
};
api.onCameraStop = (callback) => {
  const listener = () => callback();
  ipcRenderer.on('focus:camera-stop', listener);
  return () => ipcRenderer.removeListener('focus:camera-stop', listener);
};
api.onBreakEnded = (callback) => {
  const listener = (_, data) => callback(data);
  ipcRenderer.on('focus:break-ended', listener);
  return () => ipcRenderer.removeListener('focus:break-ended', listener);
};
contextBridge.exposeInMainWorld('focusReplay', Object.freeze(api));
