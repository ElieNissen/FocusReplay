# FocusReplay web

The shared website has a common account homepage and separate private profile URLs. Users can register and sign in on the website or desktop. The desktop automatically selects the shared service. For an optional deployment independent of Codex and chatgpt.site, start with [SELF_HOSTING.md](SELF_HOSTING.md). The connection-file flow below is legacy operator compatibility only.

# FocusReplay private profiles

This viewer receives an explicitly selected, reduced copy of the desktop recorder's data. It is not a backup of the desktop database.

## Develop

Node 24 is used for tests. Run `npm ci`, `npm run dev`, `npx tsc --noEmit`, `node --test tests/*.test.mjs`, and `npm run build`. D1 migrations are generated with `npm run db:generate`. The hosting manifest declares a D1 binding `DB` and an R2 binding `BUCKET`; production migrations are applied during Sites deployment. Runtime secrets belong in hosting configuration, never in this repository.

## Data and access

- `PUBLISHER_KEY` is a random 256-bit **server secret**, never distributed to desktop users. Each desktop receives only `HMAC-SHA256(PUBLISHER_KEY, "publisher:" + profileId)`, plus the site's HTTPS origin and its own profile ID. All database keys and object paths are scoped by profile ID.
- The URL uses `/?profile=PROFILE_ID`. Profile IDs are public identifiers, not credentials. The owner's desktop sets a separate viewer password for that profile. Viewers receive an HttpOnly, Secure, SameSite cookie scoped to that profile after password verification. Passwords use salted PBKDF2-SHA256. Changing a password invalidates existing viewer cookies.
- Knowing a profile ID, capture ID or URL does not authorize reading data. Every image request verifies both the profile cookie and current manifest; removing/masking an image revokes its original URL. Owner uploads require that image to appear in that profile's current manifest.
- Set `OPEN_REGISTRATION=true` to allow email/handle/password signup without invitations. The shared service uses this mode. Independent instances keep invitation mode unless explicitly enabled. `MAX_ACCOUNTS` defaults to 100 (bounded to 10,000), with 8 authentication attempts per minute and 3 registration attempts per hour per IP. Atomic insertion prevents duplicate email accounts and exceeding the account cap. Email is normalized and stored unverified; there is no email delivery or recovery flow yet. Browser account cookies authorize only the owner's private reads, never other profiles or publishing writes. Desktop login receives the existing per-profile key, stored outside renderer state.
- A connection file can overwrite its profile's replay and change its viewer password. Treat it as private; never put it on GitHub or give it to viewers.

## Storage and bandwidth

Desktop originals remain on that desktop. Defaults: 90 days (configurable up to one year, bounded by disk quota), maximum 1,024 MiB shared by screenshot/camera files. Manual video exports live outside this automatic cleanup budget.

Online: at most 800 JPEGs, at most 50,000 bytes each, each no older than 90 days. This bounds active image storage to 40 MB per profile (about 4 GB for 100 profiles, 40 GB for 1,000). Adaptive age tiers select evenly spaced representatives: up to 400 from the most recent day, 200 from days 1–7, 140 from days 7–30, and 60 from days 30–90. Dense recent replays become sparse older recollections. Unused tier capacity is not borrowed; the cap is a maximum, not a storage target. Archived online images survive local cleanup; the publisher retrieves and merges the prior manifest before uploading. Metadata is capped at 1.5 MB per manifest; daily work totals survive image expiry and are retained without a fixed age limit (the current graph displays the last year). Images have at least a 60-second delay, uploads run every 30 seconds, and the viewer checks for changes every 15 seconds. Status becomes offline after two minutes without updates.

Expired images cannot be served after 90 days. Physical object deletion currently runs when the owner sends a new manifest or removes the replay. If a desktop never reconnects, expired objects may remain stored and inaccessible. Before broader rollout, configure a scheduled sweep or a bucket lifecycle rule independently of client activity. Quota is for active images, not provider backups or uncollected expired objects. Metadata updates and image reads also incur provider operations and bandwidth; no pricing guarantee is implied.

The page loads the current image and a limited strip of lazy thumbnails, not the full archive. Access-controlled images are not publicly cached. The MVP stores one bounded manifest per profile in D1; with heavy viewing, move image authorization/metadata to indexed rows and introduce authenticated private caching, incremental uploads and server-side cleanup jobs. Do not expose public object URLs to optimize delivery.

## Privacy

Camera, check-in answers, local paths, music credentials and raw window titles are excluded. Applications/domains and individual frames can be masked before uploading. Password-manager names and accessible focused password fields are hidden conservatively, with ten seconds of activity context around captures. This is best-effort detection, not OCR or a guarantee that all passwords or personal data will be found. When private domain rules exist and a browser domain is unknown, the browser capture is hidden. Redaction cannot retract an image already copied by a viewer.

Stopping sharing first stops uploads, waits for an in-flight request, and removes the online replay. If offline, removal cannot reach the server: the desktop reports the error and must retry. The first connection only shares captures taken after it was connected, never an automatic historical screenshot backfill. The work heatmap may include historical daily totals.

## Towards a productive social network

Keep the profile as the ownership boundary. Next steps, independently:

1. Account identity, invitations, per-profile viewer grants, publishing-key rotation/revocation and a small operator provisioning interface.
2. Separate private replay data from social summaries. Friends can see a status or work total without getting permission to inspect screenshots. Nothing becomes public by default.
3. Scheduled retention, deletion verification, per-profile quotas, usage telemetry without screenshot content, and request-rate controls for reads and publishing.
4. Indexed sessions and daily activity tables, incremental manifests, private image delivery, and load tests before opening registration.
5. Feed, encouragement and achievements based on shareable aggregates. Screenshot visibility remains an independent permission with blocking/reporting controls.

Current tests cover cross-profile isolation, authenticated media, password-change revocation, rate limits, quotas and masking. This is an invitation-oriented personal MVP, not an unrestricted social platform.
