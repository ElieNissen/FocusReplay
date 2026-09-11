# One FocusReplay network

## Current evidence, 2026-09-11

The product has one common origin and separate accounts/profiles. A user does not deploy a server. Adding backend capacity must preserve that origin and those account identities. A discoverable profile means a discoverable identity, not public access to screenshots, software history or live activity. A people directory, friendships and a multi-friend live feed are planned, not implemented.

The shared deployment was configured for 100 accounts. `web/lib/share-api.ts` defaults to 100 and allows an operator setting up to 10,000. Neither number is a load-test result. No concurrent-user capacity, current occupancy, service-level guarantee, or hosting-provider budget has been established by this audit. Sites-managed quotas and billing cannot be inferred from Cloudflare's public free tier. Do not load-test the live site without a separate bounded test plan.

Online image policy: at most 800 JPEGs of 50,000 bytes each per profile, 90-day maximum age, adaptive density by age. At the policy ceiling, 100 profiles represent 4 GB of active images; 1,000 represent 40 GB; 10,000 represent 400 GB. These are decimal image-only quantities, excluding metadata, backups, operations and temporarily uncollected objects. Increasing retention without increasing this budget reduces archive density. Daily totals can outlive images.

Current publishers sync every 30 seconds; each cycle reads one full manifest and writes it twice, plus new image uploads. Each open viewer requests the full manifest every 15 seconds. Images are delayed by at least 60 seconds; polling, capture cadence, sampling, network and upload time can make them older. Presence expires after two minutes without updates. Scheduled physical cleanup is still needed when a publisher never reconnects.

For P active publishers and V open single-profile viewers, baseline metadata traffic is roughly `3P/30 + V/15` requests per second before authentication, media requests and retries. With P=100 and V=100 that is about 17 requests/second. This is a workload model, not a benchmark. Full manifests may be up to 1.5 MB, so byte volume and parsing matter as well as request count. Implementing 20 friends by copying the existing polling loop would multiply viewer requests by 20.

## Target data model and permissions

Use immutable account IDs and separate editable handles. Index accounts, public profile summaries, devices, friendships/blocks, grants, sessions, activity segments, captures and daily totals. Every private record belongs to an account/profile; authorization applies to list endpoints, individual reads, live subscriptions and image delivery. The feed must never reveal an unauthorized friend's presence through counts or timestamps.

Keep independent grants for profile discovery, presence, statistics, software names, live images/current-session seek-back, and past-session replays. Accepted friendship is not blanket screenshot permission. A password-protected guest link remains available without creating an account, with an explicit scope and revocation. Mask before upload and reject reads after grant revocation; an image already downloaded cannot be recalled.

## Delivery architecture

1. **Small-group beta:** retain the current service and cap. Instrument request latency, errors, metadata bytes, image operations, cleanup backlog and active viewers without logging captures, window titles or tokens. Add account verification/recovery, device revocation and reliable account/media deletion before broader onboarding. Start staged trials with 10, 25 and 100 concurrent publishers/viewers in staging, not promises of supported capacity.
2. **Incremental sessions:** replace whole-manifest refreshes with a versioned, idempotent delta API, per-profile sequence cursor and bounded batches. Index media authorization separately. Paginate historical sessions and load timeline details only for the selected date/range. Retain the old endpoint during desktop migration. Run expiry and orphan cleanup on the server with retries and a measurable completion deadline.
3. **Friends feed:** one authenticated, paginated request returns authorized lightweight friend cards: status, last update, permitted software, totals and a reference to the latest allowed thumbnail. Fetch thumbnails only for visible cards and stop background-tab updates. A separate session endpoint provides detailed seek-back; historical access is checked independently. Reuse precomputed daily totals for heatmaps instead of scanning raw activity on every visit.
4. **Live distribution:** the desktop uploads each new image once regardless of audience size. Heartbeats/status updates are independent from image capture and use an expiry. Begin with a single conditional feed poll, jittered and backed off on errors. Introduce SSE or WebSockets when measurements justify it; publish small version/status events, never repeated full archives. Fan out only to authorized viewers and avoid one global coordinator for the entire network. Keep image delivery private with authentication checked before cache access and bounded revocation behavior.
5. **Growth:** stateless request handlers can scale behind the same domain. Keep images in R2/S3-compatible private storage. Measure D1 queueing and query latency after indexing and incremental updates; migrate relational workloads to managed PostgreSQL only if justified, with shadow reads, verified ownership-preserving migration and rollback. Budget workers, database operations, live connections, email, logs and backups alongside image storage.

## Release gates

Test each stage with both normal small audiences and a concentrated profile watched by many friends. Include reconnect storms, slow uploads, concurrent privacy changes, stale clients, repeated deletions and access revocation. Proposed staging acceptance targets: less than 1% server errors, p95 metadata response under 500 ms at target load, bounded cleanup backlog and stable live delay under configured capture intervals. These targets are not a current SLA. Set provider budget alerts and global upload/read limits before raising the account cap. Retest capacity after changing retention, thumbnail quality or feed behavior.

## Provider references

- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/): each database processes queries serially; more request handlers alone do not remove database contention.
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/): image storage and operations are distinct; direct R2 egress has no transfer charge, which does not make the entire product free.
- [Durable Objects and WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/): a possible fan-out implementation, not a service provisioned by this plan.

This is an implementation roadmap. It does not change production quotas, publish user data, provision paid services or claim that the social features already exist.
