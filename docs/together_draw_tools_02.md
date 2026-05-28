# Together Draw Tools 02

Updated: 2026-05-25

## Scope

`TOGETHER-DRAW-TOOLS-02` keeps the backend-backed brush/eraser event model and improves phone drawing UX:

- fullscreen/focus mode gives the canvas more space;
- tool controls are collapsible;
- one finger draws or erases;
- two fingers pan and zoom;
- Move and Reset are no longer visible in the normal user drawer; two-finger pan/zoom remains the viewport control.

No draw event format change is required.

## Touch Contract

- Brush and eraser still send backend `stroke_batch` events with `tool:"draw"` or `tool:"erase"`.
- Drawing coordinates are inverse-transformed from the current viewport before save.
- Two-finger pan/zoom is viewport-only and does not persist to backend events.
- Replay/history/detail rebuild the final image from backend events, not local-only canvas state.
- If a gesture handler fails, Client Errors may report `step=canvasGestureFailed` with safe `gestureType`, `tool`, and `zoomLevel`; no drawing payload or point data is reported.

## Fullscreen Contract

- `На весь экран` hides the normal header/footer.
- `Инструменты` opens the floating brush/eraser/color/size/zoom palette.
- `Скрыть инструменты` collapses the palette so the canvas uses the available phone space.
- Exit fullscreen and leave-session controls remain visible.
- Android back first hides the palette, then exits fullscreen, then follows normal leave behavior.

## Smoke

1. Enter a real backend draw session on two devices.
2. Fullscreen on.
3. Hide the tool palette.
4. Draw with one finger.
5. Show tools and switch to eraser.
6. Erase part of the drawing and confirm peer sees it.
7. Pinch zoom and two-finger pan.
8. Draw while zoomed and confirm the stroke lands under the finger.
9. Use `+`, `-`, `Сброс`, and Move fallback.
10. Finish the session.
11. Open history/detail replay and confirm eraser effects remain.
