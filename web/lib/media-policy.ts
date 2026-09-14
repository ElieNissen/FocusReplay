export const modes = ['hidden', 'blurred', 'visible'];
export function mediaPolicy(profile: any) {
  const saved =
    typeof profile?.sharing === 'string' ? JSON.parse(profile.sharing) : profile?.sharing;
  return {
    publicScreen: profile?.public_preview ? 'visible' : 'hidden',
    publicCamera: 'hidden',
    profileScreen: 'visible',
    profileCamera: 'hidden',
    publicSoftware: false,
    ...(saved || {}),
  };
}
export function mediaRef(frame: any, policy: any, audience: string, source = 'screen') {
  if (!frame || frame.private) return null;
  const key = audience + (source === 'camera' ? 'Camera' : 'Screen');
  const mode = policy[key];
  if (mode === 'hidden') return null;
  if (!frame.media)
    return source === 'screen' && mode === 'visible' && frame.available !== false ? frame.id : null;
  const item = frame.media[key];
  return item?.available && item.mode === mode ? item.id : null;
}
export function viewerSnapshot(snapshot: any, policy: any) {
  if (!snapshot) return snapshot;
  return {
    ...snapshot,
    frames: snapshot.frames.map((f: any) => {
      const { media, ...safe } = f;
      return {
        ...safe,
        available: !!mediaRef(f, policy, 'profile'),
        cameraAvailable: !!mediaRef(f, policy, 'profile', 'camera'),
        screenMode: policy.profileScreen,
        cameraMode: policy.profileCamera,
      };
    }),
  };
}
export function imageKeys(frame: any) {
  if (frame.private) return [];
  return frame.media ? Object.values(frame.media).map((v: any) => v.id) : [frame.id];
}
