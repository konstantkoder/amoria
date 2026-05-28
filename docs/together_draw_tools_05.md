# Together Draw Tools 05

Updated: 2026-05-28

## Scope

- Phone fullscreen top actions must stay compact and horizontal.
- The canvas should keep vertical space in fullscreen.
- Brush and eraser remain the primary draw tools.
- Move and reset are not visible in the normal user drawer; two-finger pan/zoom is the viewport gesture.
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
  - Move mode is not visible to normal users;
  - `+` and `-` zoom controls are no longer prominent;
  - Reset is not visible to normal users.
- Hint remains visible: `Одним пальцем рисуйте, двумя — двигайте и масштабируйте.`

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
11. Backend draw event format is unchanged.

## Guardrails

- No local-only drawing.
- No local-only eraser.
- No backend event format changes.
- No `color_mood` restoration.
