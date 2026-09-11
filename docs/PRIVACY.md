# FocusReplay data handling

Recording is started by the user. Screenshots, foreground application activity, inferred browser domains, check-in answers and optional camera snapshots are stored on that user's Windows PC. Camera capture is opt-in. Pausing or ending recording stops capture. Work classifications are estimates, not proof of productivity. Local retention and storage limits are configurable. Exports are user-created files outside automatic retention cleanup.

Online sharing is optional and disabled until the user enables it. It sends a reduced selection of screen captures, session/activity totals, permitted software/domain labels and recording/paused/offline status to the selected server. It does not send camera photos, check-in answers, local file paths or Spotify credentials. Private app/domain rules mask captures before publishing; previously viewed images may already have been copied by a viewer. Automatic masking is best effort.

Online accounts store a public handle, an unverified email address and a salted password hash. Browsers use authentication cookies. Server rate limits use request IP addresses to limit authentication abuse. Server infrastructure providers also process requests necessary to operate the site. A profile URL alone does not grant access to screenshots: visitors need its sharing password, or the owner can sign in to view their own profile. The app's password-only viewer has no recorder or device APIs.

Online screenshot history is sampled under an image budget and a maximum age of 90 days. Aggregate history can outlive images. Stopping and removing online sharing requests deletion of the published replay; failed removals are retried. Account self-deletion, email verification and email password recovery are not implemented yet. The source explains the different cleanup schedules for managed and standalone hosting. Self-hosters operate their own database, storage and backups and must describe their own practices.

Spotify is optional. Connecting it sends OAuth requests to Spotify; searching or playing music uses Spotify's services under its own privacy policy: https://www.spotify.com/legal/privacy-policy/. Local MP3 playback does not require Spotify. The application does not include advertising or analytics SDKs. Optional online features require network requests initiated by their use; the core recorder does not require an account.

Report problems through the public repository without attaching private captures, credentials, session data or personal contact details: https://github.com/ElieNissen/FocusReplay/issues.
