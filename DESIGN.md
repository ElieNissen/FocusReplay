# FocusReplay design

## Scene and direction

A person at their desk briefly reviews a session in daylight, then returns to work. Use warm paper surfaces for controls and a dark neutral stage to distinguish captured content. Restrained terracotta accent, system sans typography. References: the topology of a video editor, the directness of Windows media controls, the simplicity of a chronological journal.

## Composition

220px session sidebar; main title and session controls; dominant screenshot stage; compact transport; timestamp-scaled filmstrip and draggable playhead; labeled software lane and application breakdown. Separate settings and optional rewards views. The first-run state offers Start, with no required form. A small camera photo overlays the stage when available. Camera consent and pause duration choices expand inline.

## Visual direction artifact

Version 0.2 removes instructional headings, explanatory footers and redundant containers. The filmstrip starts compact and grows with available captures; short software segments use staggered labels and dotted leaders. Mouse-wheel zoom and horizontal speed/zoom sliders replace menus. Export is one action using the visible day/session and current playback speed. The video has a large clock, software context and a moving graphical timeline. Camera images retain their aspect ratio with no added light frame.

A generated editor mock established the light sidebar, dark stage, orange playhead and lower filmstrip. Carry those ingredients into semantic React components. Omit the mock's mandatory goals, manual categorization sidebar, accent side-stripes and fictitious sample sessions. No rasterized interface text.

## Replay workspace, 0.8.3

Session controls live in the native window title-bar area and remain visible while scrolling. The large active-session sidebar button is removed. The screenshot stage flexes into the remaining height so the software lane and the expandable software-summary label remain visible at 860 × 680. Start/resume is reachable from every view. Resume explicitly returns to the active session and enables follow-latest.

Elapsed session time excludes the union of manual and system pauses, including overlaps. Paused time appears separately beside the timeline. Mixed software intervals show multiple icons/names and expose their breakdown on click. Check-ins sit in a horizontal time lane; nearby entries collapse into a counted group with a contextual detail panel. Privacy indicators use the same rules as online sharing, including adjacent sensitive observations; they do not imply that local MP4 exports are redacted.

The mini overlay is 300 × 54, expanding inline for pause choices including one hour. Stop remains an icon. Interface text is not selectable while dragging; editable fields retain normal text selection. Both light and dark themes retain native window controls.

## Tokens

Warm off-white canvas, near-white panels, charcoal text, muted secondary text. Terracotta accent and pale accent fill. 4px spacing grid, 8/12px radii, system UI font, 12/14/16/20/28px type roles with rem sizing. No external font requests. Color states always have a text label.

## States

Empty, recording, manually paused, system suspended, capture error, software-tracking unavailable, deleted/expired image, exporting/cancelled/failed/successful, recovery after unexpected exit. New captures never move a user's review cursor unless follow-latest is explicitly on.
