# Admin Web Regression Pass

Updated: 2026-05-25

## Pages Checked

- Dashboard / Панель
- Users / Пользователи
- Admin Users / Администраторы
- Client Errors / Ошибки клиента
- Reports / Жалобы
- Media Moderation / Модерация медиа
- Together Queue / Очередь Together
- Together Sessions / Сессии Together
- Audit Log / Аудит
- Ops Health / Состояние Ops
- Bootstrap / Первый owner

## Fixed In This Pass

- Together Queue now shows `geoMode` and filters by activity, status, radius, `geoMode`, and `hasCoordinates`.
- Together Queue helper text explains that new requests require coordinates and no-limit still uses geolocation.
- Together Queue now distinguishes `waitingReason` from `cancelSource`, shows `cancelReason`, `cancelledAt`, and `lastAction`, and highlights suspicious lifecycle cancels.
- Russian queue age label is now `Время в очереди`, not `Возраст`.
- Old coordinate-less rows are labeled as old invalid entries without exposing coordinates.
- Together Sessions shows top-level latest heartbeat and left timestamp in addition to participant-level diagnostics.

## Already OK

- Media Moderation uses public previews when allowed and audited admin content fetch for locked media.
- Reports load list/detail and write audited actions.
- Client Errors can filter/load and update lifecycle state.
- Audit Log displays recent admin actions.
- Ops Health reports DB status, honest object-storage status, and current counts.
- Owner/ops/moderator/support page access remains role-gated by backend policy.

## Still Incomplete

- This shell did not perform an authenticated browser walkthrough with real owner/ops/moderator/support accounts.
- Public beta readiness still requires manual Admin Web smoke against the real backend and real media/report/client-error rows.

## Safety

Admin Web must not show secrets, tokens, passwords, raw event payloads, private chat, locked media without audited reason, or exact coordinates.

## Sessions Visibility

If a queue row cancelled before match, Admin Sessions should not show a session for it. If `matchedSessionId` exists, the Sessions page should show the session newest-first, including zero-event sessions, stale heartbeat, participant `leftAt`, and `endedReason`.
