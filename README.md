# FocusReplay

**Start. Work. Rewind.** A private Windows app that makes your workday visible through periodic screenshots and foreground application history. No goals to type, no manual journal, no account.

![FocusReplay dark interface with fictional demonstration data](docs/images/replay-dark.png)

## What it does

- **One-click sessions:** automatic names, start/pause/resume/stop, tray controls and an optional floating mini-bar.
- **Real pauses:** 2, 5, 10 or 15 minutes, a custom duration, or an indefinite pause. Timed pauses end with a chime and notification; recording only resumes when you ask. Ending a session cancels its pause alarm.
- **Two independent records:** screenshots every 10 seconds to 10 minutes; foreground application estimates every 2 seconds.
- **Interactive replay:** drag the timeline for immediate preview, step with the arrow keys, press Space to play, zoom the timeline or screenshot, and review while recording continues.
- **Application timeline:** labeled segments link software usage to the nearest preceding screenshot. The summary shows application durations and percentages of observed time.
- **Automatic, cautious categories:** work probable, distraction probable, unknown and idle. Browser hints are processed locally without retaining raw window titles. No AI service or productivity score.
- **Gentle reminders:** configurable session reminders and optional probable-distraction nudges.
- **Start music:** import your own MP3, choose the volume and a 15/30/60-second intro or the complete track. No Spotify integration in this version.
- **MP4 export:** a day, a session or a marked range, with timestamps and software names; 720p/1080p and 1/2/4/8 captured images per second.
- **Bounded storage:** compressed JPEGs, 3-day retention and 1 GB capture cap by default.
- **Dark and light themes**, plus Windows theme preference.
- **Optional camera photos:** off by default, explicit in-app consent, no microphone. A camera photo accompanies each screenshot and appears in picture-in-picture during replay and optionally in the MP4. Camera access stops during pauses, locking and session end.
- **Optional rewards:** configurable points per hour, custom break/game/movie rewards, a persistent points balance and a pause timer. Normal pauses never require points.

## Run on Windows

Requires Windows 10/11 x64. The interface is in French. A portable build runs without a development environment; building from source requires Node.js 24 LTS and Git.

French walkthrough: [Essayer FocusReplay avec de vraies données](docs/DEMARRER.fr.md).

```powershell
git clone https://github.com/ElieNissen/FocusReplay.git
cd FocusReplay
npm ci
npm exec -- install-electron --no
npm start
```

Dependency installation downloads Electron and the local FFmpeg encoder. Normal application use works offline.

Click **Commencer une session**, then get on with your day. You can review immediately. Close the window to keep recording in the tray, use **Pause** for a private moment, **Terminer** to finish, or the tray's **Quitter** command to exit completely. The app does not silently start with Windows.

For music and capture options, open **Réglages**. Reducing retention or the cap deletes eligible old captures immediately. Export a replay before its captures expire if you want to keep it.

## Build a portable executable

```powershell
npm run dist
```

The build is written to `release/FocusReplay-0.1.0-Windows.exe`. It is unsigned; Windows may show a publisher warning. Signing and a public binary release are not configured. The encoder's third-party notices and source-distribution requirements are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## What the numbers mean

Foreground time is sampled, not continuous. An app running in the background receives no time. Gaps, pauses and unavailable observations are not counted as work. Five minutes without user input are labeled idle; that can also mean reading or watching a work-related video. Durations are estimates and category names deliberately say **probable**.

Code and office tools are recognized as work-related; selected game launchers and entertainment services as possible distractions. Browsers, messaging, Spotify and YouTube remain ambiguous unless a specific browser hint is recognized. No system can infer your intention from a process name alone.

A screenshot is one instant. Scrubbing between screenshots displays the previous available image with its true timestamp. The application track can show a change that occurred between captures. Protected/DRM surfaces may appear black. The first version captures one selected monitor, not all monitors at once.

Camera photos are taken near each screen capture and have their own timestamps. The camera stream stays open during an enabled session, so the camera light can remain on; only periodic photos are saved. The camera defaults to the Windows default device. Failure to get a camera picture does not stop screen capture. No facial recognition or reliable desk-presence detection is implemented; idle time is keyboard/mouse inactivity, not proof that someone left the desk.

Rewards are disabled by default. Choose how many points one observed hour earns, and whether only probable work or all non-idle observations count. Rates apply going forward; unspent points survive screenshot expiry. Redeeming a reward deducts its cost and pauses recording. A chime and notification mark the planned end, but no recording restarts automatically. This is a personal budgeting aid, not a measure of effort or a restriction on taking breaks.

## Local data and GitHub

Data lives outside the repository, normally in `%APPDATA%/FocusReplay`. Use **Réglages → Ouvrir le dossier local** to find it. MP4 exports stay in the folder you choose. The repository ignores recordings, audio, exports, local profiles and build/test output. Public screenshots in `docs/images/` contain only generated fictional test content.

Advanced: launch with `--focus-data-dir="D:\FocusReplayData"` to choose a separate local profile. Keep that folder private and outside your source repository.

See [SECURITY.md](SECURITY.md) for exact data flow, retention and limitations. The app does not encrypt local files or send them anywhere.

## Development and verification

```powershell
npm test                 # Lifecycle, recovery, retention, quota, classification, timeline
npm run test:e2e         # Full Electron UI flow using fictional captures and test audio
npm run check:privacy    # Check public files for private artifacts and common secret patterns
npm run build           # Build the renderer
```

`npm run dev` opens the real recorder with live React/CSS updates on a loopback-only development server. Interface edits appear immediately. Changes under `electron/` save and end the current session, then restart the app; you choose when to start recording again. Development recordings live in the separate ignored `work/dev-profile/`, preserving your normal application history. Use `node scripts/test-dev.mjs` to verify hot updates. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and module boundaries.

E2E profiles are isolated under ignored `work/` directories. `node scripts/smoke-windows.mjs` additionally verifies real Windows capture and foreground tracking in a private temporary profile, then removes the real samples on success. Never publish those test profiles.

After packaging, `node scripts/smoke-windows.mjs --packaged` checks the actual packaged application and its Windows tracking helper. The camera E2E uses a generated color-pattern video as a fake device; it never opens a physical webcam.

Architecture: Electron main process owns capture, lifecycle and filesystem access; React renders the editor; a persistent Windows helper reports only process names and category hints; atomic JSON metadata indexes generated JPEG files; FFmpeg encodes an export from a pinned snapshot. The public IPC surface is defined in `electron/preload.cjs`.

## License

Original FocusReplay code: [MIT](LICENSE). Dependencies and the separate FFmpeg encoder retain their own licenses.
