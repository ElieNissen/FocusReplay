# From personal replay to a small productive social network

Current capacity and implementation priorities: [SCALABILITY.md](SCALABILITY.md). That plan supersedes the historical invitation-only stages below: the shared service now has bounded open registration. Raising its account cap requires load testing. The hosted service already uses D1 and R2; the SQLite/filesystem migration discussion below applies to the optional standalone adapter, not the currently hosted objects. PostgreSQL is an option justified by measurements, not an automatic migration at a particular user count. Password-protected guest viewing remains supported alongside account-based friend permissions.

## Ownership boundary

The primary product is a centrally hosted service: users register and connect through the interface, with no server, connection file or hosting account of their own. Self-hosting is an optional portability and ownership guarantee, not the normal onboarding requirement. Start with the existing managed Worker, D1 database and private R2 object storage; keep invitations during the small-group beta. Do not provision a second server just to duplicate these services. A branded domain and measured service budgets precede broader promotion.

A profile belongs to an account. Owning a profile, knowing its viewer password, being its friend and being allowed to inspect its screenshots are distinct capabilities. Do not turn the current viewer password into account login or let a public profile imply replay access.

## Delivery stages

Version 0.8.1 adds a common website homepage, email signup/login, server selection hidden by default in desktop, and revocable browser sessions for the owner's own profile. The shared service permits registration without invitations, with a 100-account default capacity cap and per-IP rate limits. Independent instances retain invitation mode by default. Email addresses are unverified; email verification and recovery remain required before a broader rollout. The account/grant roadmap below is otherwise unchanged: signup does not confer access to any other user's screenshots.

1. **Independent base (this change):** standalone deployment, persisted per-instance secrets, invitation-gated account registration and desktop login without files. Existing replay isolation and per-profile image budgets remain. No public account directory or open sign-up.
2. **Account management:** owner sessions and per-device tokens with revocation, password change/recovery, one-use expiring invitations, account deletion with verified image cleanup, and a minimal operator interface. Add an immutable account ID distinct from the editable public handle before building friendships. Migrate legacy accounts only with proof of existing ownership. This is the next release gate before inviting a larger audience.
3. **Small friends network:** explicit profile visibility, invitations/friend requests, accepted relationships and blocking. A people page lists only profiles the current account may discover. Show live/paused/offline presence with expiry, a chosen display name/avatar, and aggregate work activity. Each user opts in to these fields. Screenshots stay private behind a separate grant, and the default social feed contains no images or window titles.
4. **Live and replay grants:** named viewers, revocable access, optional time-limited links, a clear visible audience beside the sharing control, and independent permissions for live access, archived replay, status, daily totals, software names and images. The friends feed shows all permitted live friends: latest allowed screenshot, capture timestamp/delay, live/paused/offline status and current software. Opening a card reveals that session's timeline and software history, with seek-back and a return-to-live action. A live grant does not implicitly unlock previous sessions. Keep screenshots opt-in; show a private placeholder without an image grant. Apply privacy rules before upload and re-check authorization on every image read, including after revocation. Existing shared viewer passwords remain a limited compatibility path, then expire.
5. **Encouragement:** reactions, milestones and voluntary group sessions based on aggregate data, with mute/block controls. Avoid public comparisons of private screenshots and forced leaderboards. Activity classification remains an estimate that the owner can correct.

## Storage and scale

Today the desktop compresses and samples images before sending, and the server applies an authenticated manifest and an image budget. At 40 MB of active images each, 100 profiles need up to 4 GB and 1,000 profiles up to 40 GB, excluding backups and metadata. These are capacity estimates, not concurrent-user performance claims.

For a multi-server service, retain the authorization boundary and replace the single SQLite datastore with PostgreSQL (accounts, devices, relationships, grants, sessions, daily totals and media index) and filesystem objects with private S3-compatible storage. Use explicit account/profile foreign keys in every table and object namespace; authorization belongs in services and queries, not only routes. Keep SQL/D1 adapters and object storage adapters separate from the access-control logic.

Before that migration: replace the JSON manifest as the media authorization index with indexed image records; introduce incremental uploads, per-account and global quotas, a durable cleanup queue, scheduled object-lifecycle enforcement and private authenticated caching. Presence should expire independently of screenshots; start with short polling, then use server events if load measurements justify it. Do not proxy private images through public cache URLs.

## Gates for broader release

Measure upload/read bandwidth, datastore operations, cleanup lag and failed removals without collecting screenshot content. Run realistic concurrent-viewer and registration abuse tests. Add cross-account tests for every new social endpoint, explicit permission-change tests, restore drills, audit events for grants, device revocation, blocking and account removal. No open registration until account recovery, quotas, abuse controls, moderation and deletion guarantees are operational.

## UI direction

The desktop keeps recording and replay as its main surface. Profile contains account and audience controls. A separate **Friends** view shows permitted profiles and current presence. The website uses the same account identity and permissions; embedding it later in the app must not create a second authentication system or expose native recording APIs to remote content.
