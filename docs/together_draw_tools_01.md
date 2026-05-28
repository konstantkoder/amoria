# Together Draw Tools 01

Updated: 2026-05-25

## Scope

`TOGETHER-DRAW-TOOLS-01` improves the backend-backed draw scenario before the next dev build:

- brush and eraser tools;
- brush size and eraser size;
- zoom in, zoom out, and reset zoom;
- move mode for panning the zoomed viewport;
- fullscreen/focus drawing mode with an always-available session exit.

No mock data, fake drawing events, local-only eraser success, Firebase fallback, Nearby, Announcements, or `color_mood` path is part of this block.

## Eraser Contract

Draw events remain ordinary backend `stroke_batch` events. Each stroke may include:

```json
{
  "tool": "draw"
}
```

or:

```json
{
  "tool": "erase"
}
```

Legacy strokes without `tool` are treated as `draw`.

The mobile canvas renders `erase` strokes with canvas compositing, but the erase stroke is still sent to the backend, broadcast through WebSocket, stored in session events, and restored by `getSessionEvents` hydration. If a WebSocket event is missed, the periodic backend refresh rebuilds the same stroke list and the erased result returns.

## Zoom And Pan

Zoom and pan are viewport-only:

- `+` zooms in;
- `-` zooms out;
- `Сброс` / `Reset` returns to the original viewport;
- `Move` mode pans the zoomed canvas;
- drawing coordinates are converted through the inverse viewport transform before they are saved.

Zoom state is not persisted and does not alter replay data.

## Fullscreen / Focus Mode

`На весь экран` / `Fullscreen` hides the regular app header and non-critical footer copy so the canvas gets more phone space. The user can still:

- switch brush/eraser/move;
- change brush/eraser size;
- use zoom controls;
- exit fullscreen;
- leave the session.

Android back exits fullscreen first instead of trapping the user or leaving the session by accident.

## Manual Smoke

1. Device A and B enter one real backend `draw` session.
2. A draws with brush; B sees the stroke.
3. A switches to eraser and erases part of the drawing.
4. B sees the erased result through WebSocket or backend refresh.
5. B draws after the erased area; A sees correct strokes.
6. Zoom in, draw while zoomed, and confirm the stroke lands under the finger.
7. Confirm Move and Reset are not visible in the normal drawer, then pan/zoom with two fingers.
8. Reset zoom.
9. Enter fullscreen, draw, zoom, and erase.
10. Exit fullscreen and confirm leave session is still available.
11. Finish session.
12. Open history/detail replay and confirm the eraser effect is preserved.

## Client Error Safety

Client Errors may include safe tool/control metadata such as `tool`, `nextTool`, `viewportAction`, and event counts. They must not include drawing payloads, raw point arrays, exact coordinates, secrets, or huge event data.
