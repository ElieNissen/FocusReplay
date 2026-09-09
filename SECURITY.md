# Privacy and security

## Data flow

Recording and replay make no analytics or AI requests. Optional Spotify music sends authorization and playback requests to accounts.spotify.com and api.spotify.com; screenshots and activity are never sent to Spotify. Recording does not require an account. Build-time npm downloads are separate from application runtime.

Screenshots, application names, category estimates, session timestamps and settings are written under Electron's per-user `FocusReplay` data directory. On Windows this is normally `%APPDATA%/FocusReplay`. Each phase’s chosen MP3 is copied there with a generated filename; only its display name appears in settings. Nothing is stored in the source repository by default.

The foreground process is sampled approximately every 2 seconds **during active recording only**. When browser hints are enabled, a bounded window title is inspected in memory for a small set of known terms; only the inferred category is emitted by the helper. Window titles, full URLs, keystrokes, clipboard contents, executable paths and microphone audio are not logged. Optional browser-domain tracking reads a recognized address bar via Windows UI Automation and stores only its domain, including in private windows if accessible. No browser history is read. Screenshots can of course contain anything visible on the selected display, including a URL or private message.

Manual pause, Windows locking and sleep suspend capture and foreground tracking. Closing the main window hides it to the tray; Quit ends capture. A recovered session never resumes recording automatically after a crash.

The optional webcam is disabled by default. Enabling it requires a separate explicit confirmation in settings before media permission is allowed. Only the main window can request video, only in an active session; audio media permissions are denied. Windows can additionally deny camera access. The application keeps the camera stream open while recording, saves only interval JPEG snapshots, and closes all tracks on pause, lock, stop, or disabling the option. A missing camera frame is not replaced with a stale photo in the exported video. Camera JPEGs are included in the same age/size cleanup and deletion as the associated screen capture.

No face recognition, identity estimation, or camera-based presence classification is used. Test camera images come from Chromium's fake device, never a user's camera.

## Retention

Capture age and total encoded-image size control deletion. Cleanup runs at startup and once per minute while the app is running. Captures in an active export are temporarily protected; the cap can be exceeded during that export, and cleanup catches up afterward. The cap excludes metadata, the optional MP3, application binaries, export staging and saved MP4s. Expired sessions and their activity records are purged as well.

The filesystem is not encrypted by FocusReplay. Use normal Windows account and disk protection. Exports are deliberately independent of retention and must be deleted separately. Imported audio is kept until replaced or removed.

The optional reward wallet persists aggregate points, counted time, configured reward names and the 50 most recent redemptions independently of capture retention. Timed manual pauses are cancelled when a session ends; expired reward timers can be acknowledged after reopening. No recording resumes automatically from either kind of timer.

## Application boundary

The renderer is sandboxed, context-isolated, has no Node integration and receives a narrow IPC API. Handlers check the calling window and main frame. Media uses generated capture IDs and never accepts arbitrary filesystem paths. Navigation and popups are denied. Permission requests are denied except opted-in video capture for the main recording window. Export passes argument arrays to a fixed local executable without a shell. Export labels are escaped and staging filenames are generated internally.

## Optional Spotify connection

Authorization uses PKCE and a short-lived HTTP callback listening only on 127.0.0.1:43827. Random state binds the callback to the login attempt. There is no client secret. Refresh/access tokens are encrypted with Electron safeStorage (Windows account protection) in spotify-auth.bin, separate from session metadata; the renderer receives only connection status. Disconnect removes the local credentials, and authorization can also be revoked from Spotify account settings. The Client ID, device selection and user-entered music links are local settings; never commit a user profile.

Playback permissions are user-read-playback-state and user-modify-playback-state. The library picker also requests playlist-read-private and playlist-read-collaborative. Search terms and library requests go to Spotify; approved cover images load from i.scdn.co. Music selections are saved locally and do not modify Spotify playlists. Playback targets the explicitly chosen Spotify device and stops only while the current device/content still match app-controlled playback. Spotify state changes cannot be made atomic with remote user actions; a simultaneous manual change or loss of connectivity can race the final stop command. Repeat/shuffle are set off for each app-triggered playback and are not restored automatically.

## Reporting a problem

Do not attach personal captures, full data files or private logs to public issues. A description with fictional reproduction steps is usually enough. For a sensitive vulnerability, use GitHub's private vulnerability reporting if enabled.
