# Developing FocusReplay

## A short feedback loop

Install dependencies as described in the README, then run `npm run dev`. It opens the actual Windows recorder, initially stopped, using an isolated local profile in `work/dev-profile/`. Click Start to test real activity. Camera consent is still required. No demonstration sessions are injected into this profile.

- Edit React components or CSS: Vite and React Fast Refresh update the visible interface without rebuilding the executable. Compatible component edits preserve UI state and the main recorder continues independently.
- Edit `electron/*.cjs` or `electron/activity.ps1`: the development launcher asks the app to finish saving and quit, then reopens it. An active session ends deliberately; recording does not silently restart.
- Edit build configuration or dependencies: restart `npm run dev`.
- Build the portable app with `npm run dist` when a milestone is ready. Replace the executable while FocusReplay is fully closed; the normal data directory stays separate.

The development server binds only to `127.0.0.1:5173`. Its development-only script/WebSocket policy is not included in the production build. Packaged builds ignore development URL and synthetic capture environment variables. `--focus-data-dir` explicitly selects a separate real profile when needed.

Do not run the hot-update test simultaneously with editing `src/App.jsx`: the test makes a temporary text change and restores it in `finally`.

## Module boundaries

| Area                                   | Owner                                        | Extension point                                                                          |
| -------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Session lifecycle, retention, points   | `electron/core.cjs`                          | Pure validation and a serialized recorder with injected clock/capture/activity providers |
| Windows foreground activity            | `electron/tracker.cjs`, `activity.ps1`       | Emit a process name and conservative category; never raw window titles                   |
| App windows, permissions, capture, IPC | `electron/main.cjs`, `preload.cjs`           | Add narrow validated methods; renderer never gets general filesystem access              |
| Video export                           | `electron/export.cjs`                        | Consumes a pinned immutable frame selection; independent of the recording loop           |
| Replay and timeline                    | `src/App.jsx`, `lib.mjs`                     | Timestamp-based selection and pure timeline helpers                                      |
| Settings                               | `src/SettingsView.jsx`                       | Persistent validated settings with sensible defaults                                     |
| Camera                                 | `src/useCamera.js`                           | Opt-in stream lifecycle and periodic JPEG responses                                      |
| Rewards and pauses                     | `src/Rewards.jsx`, `chime.js`                | Optional wallet UI and reusable end-of-pause signal                                      |
| Visual system                          | `src/tokens.css`, `styles.css`, `extras.css` | Shared light/dark tokens, semantic controls and reduced motion                           |

Keep future features in their own module instead of adding unrelated behavior to the replay screen. Add settings through `validateSettings`, then the relevant settings component. Add lifecycle behavior to the recorder and exercise it using the injected clock before wiring the UI.

## Data compatibility and growth

Metadata has an explicit schema version and atomic replacement. Additive settings receive defaults when opening older data; unknown versions are preserved and rejected rather than overwritten. A schema-changing feature must supply a tested migration and backup strategy before it ships.

JPEGs remain separate files; metadata contains IDs and timestamps, not encoded images. Screenshots and foreground observations have independent sampling rates. Retention bounds normal history, timeline lookup uses binary search, and exports pin their inputs during cleanup.

This prototype targets one person's bounded local history. It does not claim unlimited scale. If longer histories make full metadata snapshots or JSON writes costly, introduce paged session queries and a SQLite repository behind the recorder boundary. Preserve timestamp semantics, retention, export pinning and the IPC contract. Run expensive future image analysis in a worker, with explicit consent, rather than blocking the capture loop.

## Verification before sharing

Run `npm test`, `npm run test:e2e`, `node scripts/test-dev.mjs` and `npm run check:privacy`. After packaging, run `node scripts/smoke-windows.mjs --packaged` on Windows. That check takes real screen samples in its own profile and deletes them on success. Failed test profiles remain private under ignored `work/` and must never be published.

Review staged files and screenshots separately. Only fictional demonstrations belong in `docs/images/`. Never include personal recordings, imported music, local settings, exports or credentials in a pull request.
