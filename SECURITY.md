# Privacy and security

## Data flow

The application makes no application-level network requests, analytics calls or AI requests during normal recording and replay. It does not require an account. Build-time npm downloads are separate from application runtime.

Screenshots, application names, category estimates, session timestamps and settings are written under Electron's per-user `FocusReplay` data directory. On Windows this is normally `%APPDATA%/FocusReplay`. A chosen MP3 is copied there using a generic filename. Nothing is stored in the source repository by default.

The foreground process is sampled approximately every 2 seconds **during active recording only**. When browser hints are enabled, a bounded window title is inspected in memory for a small set of known terms; only the inferred category is emitted by the helper. Window titles, URLs, keystrokes, clipboard contents, executable paths and microphone audio are not logged. Screenshots can of course contain anything visible on the selected display, including a URL or private message.

Manual pause, Windows locking and sleep suspend capture and foreground tracking. Closing the main window hides it to the tray; Quit ends capture. A recovered session never resumes recording automatically after a crash.

The optional webcam is disabled by default. Enabling it requires a separate explicit confirmation in settings before media permission is allowed. Only the main window can request video, only in an active session; audio media permissions are denied. Windows can additionally deny camera access. The application keeps the camera stream open while recording, saves only interval JPEG snapshots, and closes all tracks on pause, lock, stop, or disabling the option. A missing camera frame is not replaced with a stale photo in the exported video. Camera JPEGs are included in the same age/size cleanup and deletion as the associated screen capture.

No face recognition, identity estimation, or camera-based presence classification is used. Test camera images come from Chromium's fake device, never a user's camera.

## Retention

Capture age and total encoded-image size control deletion. Cleanup runs at startup and once per minute while the app is running. Captures in an active export are temporarily protected; the cap can be exceeded during that export, and cleanup catches up afterward. The cap excludes metadata, the optional MP3, application binaries, export staging and saved MP4s. Expired sessions and their activity records are purged as well.

The filesystem is not encrypted by FocusReplay. Use normal Windows account and disk protection. Exports are deliberately independent of retention and must be deleted separately. Imported audio is kept until replaced or removed.

The optional reward wallet persists aggregate points, counted time, configured reward names and the 50 most recent redemptions independently of capture retention. Timed manual pauses are cancelled when a session ends; expired reward timers can be acknowledged after reopening. No recording resumes automatically from either kind of timer.

## Application boundary

The renderer is sandboxed, context-isolated, has no Node integration and receives a narrow IPC API. Handlers check the calling window and main frame. Media uses generated capture IDs and never accepts arbitrary filesystem paths. Navigation and popups are denied. Permission requests are denied except opted-in video capture for the main recording window. Export passes argument arrays to a fixed local executable without a shell. Export labels are escaped and staging filenames are generated internally.

## Reporting a problem

Do not attach personal captures, full data files or private logs to public issues. A description with fictional reproduction steps is usually enough. For a sensitive vulnerability, use GitHub's private vulnerability reporting if enabled.
