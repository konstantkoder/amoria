# Together Draw Tools 04

Updated: 2026-05-26

## UX Contract

- Normal draw mode opens with tools hidden by default.
- Visible default controls are compact: Tools, timer, fullscreen, finish, and leave.
- Canvas is visually dominant in normal mode.
- The tool drawer appears only after tapping `Инструменты` / `Tools`.
- Fullscreen has one top/edge tools button and no duplicate bottom floating tools button.
- Android back closes the drawer first, exits fullscreen second, then follows normal leave behavior.

## Tool Drawer

- Primary tools: brush and eraser.
- Move and Reset are no longer visible in the normal user drawer; two-finger pan/zoom is the viewport gesture.
- Color chips, brush sizes, eraser sizes, and zoom controls are compact.
- Hint copy: `Одним пальцем рисуйте, двумя — двигайте и масштабируйте.`

## Regression Pass

1. One-finger draw works.
2. One-finger erase works.
3. Two-finger pan/zoom works.
4. Zoomed drawing lands under the finger.
5. Peer receives brush and erase strokes.
6. Replay/history preserves erase because strokes remain backend `stroke_batch` events with `tool:"erase"`.
7. Gesture failures report `canvasGestureFailed` with gesture type, tool, and zoom level, without point payload.

No backend stroke format, replay/history storage, Together matching, geolocation, Nearby, or Announcements behavior changed in this block.
