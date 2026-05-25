# Together Draw Tools 01

Updated: 2026-05-25

## Backend Contract

Draw eraser is backend-backed through the existing `stroke_batch` event stream. A draw stroke can carry `tool:"draw"` or `tool:"erase"`; legacy strokes without `tool` remain valid and are treated as draw strokes.

The server normalizes draw `stroke_batch` payloads before writing events:

- `draw` sessions accept `stroke_batch` with `tool:"draw"` or `tool:"erase"`;
- unsupported stroke tools are rejected;
- `story_sparks` sessions still reject stroke events;
- events endpoint returns erase events in the same stable event order as brush strokes.

No local-only eraser success, fake drawing event, Firebase fallback, Nearby, Announcements, or `color_mood` path is part of this block.

## Replay / Hydration

Replay/history/detail rely on backend session events. Mobile restores eraser effects by replaying the ordered `stroke_batch` list, so missed WebSocket events are corrected by `getSessionEvents` refresh.

## Manual Smoke

1. Draw with brush.
2. Switch to eraser.
3. Erase part of drawing.
4. Confirm peer sees the erase effect.
5. Finish session.
6. Open history/detail replay.
7. Confirm eraser effect is preserved.
8. Zoom in/out/reset.
9. Draw while zoomed.
10. Fullscreen on/off.
