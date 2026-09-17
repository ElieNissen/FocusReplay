# FocusReplay design

## Scene and direction

A person at their desk briefly reviews a session, then returns to work. Version 0.9 uses the user-supplied HeroUI light/dark theme: restrained blue accent, neutral surfaces and locally bundled Geist. Keep captured content dominant. References: video editor navigation and Windows media controls. HeroUI 3.2.5 documented compound Select, Switch, Slider, Chip and Button APIs provide controls; custom CSS handles replay geometry rather than reimplementing control behavior.

## Composition

220px session sidebar; main title and session controls; dominant screenshot stage; compact transport; timestamp-scaled filmstrip and draggable playhead; labeled software lane and application breakdown. Separate settings and optional rewards views. The first-run state offers Start, with no required form. A small camera photo overlays the stage when available. Camera consent and pause duration choices expand inline.

## Visual direction artifact

Version 0.2 removes instructional headings, explanatory footers and redundant containers. The filmstrip starts compact and grows with available captures; short software segments use staggered labels and dotted leaders. Mouse-wheel zoom and horizontal speed/zoom sliders replace menus. Export is one action using the visible day/session and current playback speed. The video has a large clock, software context and a moving graphical timeline. Camera images retain their aspect ratio with no added light frame.

A generated editor mock established the light sidebar, dark stage, orange playhead and lower filmstrip. Carry those ingredients into semantic React components. Omit the mock's mandatory goals, manual categorization sidebar, accent side-stripes and fictitious sample sessions. No rasterized interface text.

## Replay workspace, 0.8.3

Session controls live in the native window title-bar area and remain visible while scrolling. The large active-session sidebar button is removed. The screenshot stage flexes into the remaining height so the software lane and the expandable software-summary label remain visible at 860 × 680. Start/resume is reachable from every view. Resume explicitly returns to the active session and enables follow-latest.

Elapsed session time excludes the union of manual and system pauses, including overlaps. Paused time appears separately beside the timeline. Mixed software intervals show multiple icons/names and expose their breakdown on click. Check-ins sit in a horizontal time lane; nearby entries collapse into a counted group with a contextual detail panel. Privacy indicators use the same rules as online sharing, including adjacent sensitive observations; they do not imply that local MP4 exports are redacted.

The mini overlay is 210 × 44 without a window or CSS shadow. Pause immediately suspends capture and expands to 210 × 258 with two columns of duration presets, custom minutes and a stop icon. Stop only appears while paused. Resume collapses it. Reveal motion takes 180 ms and is disabled with reduced motion. Interface text is not selectable while dragging; editable fields retain normal text selection. Both themes retain native window controls.

## Tokens

The supplied theme.css is authoritative for semantic colors. HeroUI controls use accent, surface, default, success, warning and danger roles; labels accompany privacy/color states. Geist is bundled without external font requests. CSS layers place application layout after base resets and before component styles. Timeline spacing and proportions follow timestamps. Exact recent application intervals are preserved; visual groups expose names and durations at the current zoom.

## States

Empty, recording, manually paused, system suspended, capture error, software-tracking unavailable, deleted/expired image, exporting/cancelled/failed/successful, recovery after unexpected exit. New captures never move a user's review cursor unless follow-latest is explicitly on.

## Product Desktop reference review (0.9)
The user's Cosmos Product Desktop collection informed the final hierarchy: compact neutral command bars, bounded corner radii, a single strong accent for primary actions, and subtle separators rather than shadows around every region. Reference light editor and dark automation list were inspected directly. Replay geometry and the compact overlay remain custom; standard form and selection behaviors use HeroUI. The web heatmap is a disclosure so it does not displace playback controls. Secondary commands use neutral foreground for readable contrast on dark surfaces.

## Interaction refinement, 0.9.1
Selected navigation uses a neutral elevated surface with readable foreground and aria-current. Nested social sections use an underline; exclusive settings use HeroUI ToggleButtonGroup. Restrained gradients and inset highlights distinguish selected controls and the replay surface. The compact overlay remains shadow-free.

Web filmstrip supports pointer-captured seeking with touch pan-y, keyboard seeking and a visible playhead. Thumbnail and software-group density responds to viewport width. Wheel and slider zoom center the current playhead, bounded at either end. Capture privacy uses a contextual HeroUI Popover with explicit per-capture and global rule removal labels; automatic sensitive-content guards remain.

Export expands inline, offering 1–8 captures per second, 720p compact / 1080p balanced / 1080p detailed, optional camera, computed duration and approximate size range. H.264 quality presets use CRF 28/24/18. Estimates are not file-size guarantees. Local exports remain distinct from online redaction.

## Web replay playback
The authorized web replay uses `/api/p/:profile/images` to fetch at most 16 derivatives per request. Authentication, friend scope, privacy rules and current media policy are checked before any object is read. Multipart responses are private/no-store; decoded blobs are held only in a bounded in-memory cache and revoked on logout and policy refresh. Playback fills 12–24 frames before starting, then maintains a rolling lookahead. A failed image is skipped for that playback attempt rather than causing an endless buffer loop.

The web and desktop timeline share `web/lib/activity-overview.mjs`; `src/activity-overview.mjs` re-exports it for desktop imports. The preview, centered transport, ruler, filmstrip and activity track take the primary viewport. Historical statistics stay below the replay workspace. Selecting an activity group opens its duration breakdown in context.
