# Together Draw Tools 05

Updated: 2026-05-27

## Scope

- Phone fullscreen top actions must stay compact and horizontal.
- The canvas should keep vertical space in fullscreen.
- Brush and eraser remain the primary draw tools.
- Move and reset are secondary fallbacks because two-finger pan/zoom is the main viewport gesture.
- Backend draw event format stays unchanged.

## Fix

- Focus fullscreen topbar now keeps the timer on the left and puts actions in a horizontal scroll row.
- Long labels are shortened in focus mode:
  - `Инструменты` -> `Инстр.`
  - `Выйти из полного экрана` -> `Выйти`
  - `Вернуться в меню` -> `Меню`
- Tool drawer is lighter:
  - primary row: brush, eraser;
  - colors and size chips are smaller;
  - Move mode is secondary fallback;
  - `+` and `-` zoom controls are no longer prominent;
  - reset remains available as a small secondary action.
- Hint remains visible: `Одним пальцем рисуйте, двумя — двигайте и масштабируйте.`

## Smoke Checklist

1. Fullscreen phone topbar is horizontal and compact.
2. No duplicate bottom tools button.
3. Tools menu is compact.
4. Move is not a primary tool.
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
