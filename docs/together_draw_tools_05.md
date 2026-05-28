# Together Draw Tools 05

Updated: 2026-05-28

## Scope

- Phone fullscreen top actions stay compact and horizontal.
- The canvas keeps vertical space in fullscreen.
- Brush and eraser remain the primary draw tools.
- Move and Reset are not visible in the normal user drawer.
- Two-finger pan/zoom remains the viewport gesture.
- Backend draw event format stays unchanged.

## Smoke Checklist

1. Fullscreen phone topbar is horizontal and compact.
2. No duplicate bottom tools button.
3. Tools menu is compact.
4. Move and Reset are not visible in the drawer.
5. One-finger draw works.
6. One-finger erase works.
7. Two-finger pan/zoom works.
8. Drawing while zoomed lands under the finger.
9. Peer receives strokes.
10. Replay/history preserves erase.

## Guardrails

- No local-only drawing.
- No local-only eraser.
- No backend event format changes.
- No `color_mood` restoration.
