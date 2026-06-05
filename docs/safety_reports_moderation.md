# Safety Reports Moderation

Updated: 2026-06-05

## Scope

`ADMIN-REPORTS-MODERATION-WORKFLOW-01` improves the existing Admin Reports workflow. It does not change mobile behavior, Nearby logic, Together logic, media storage rules, billing, announcements, or database schema.

## Moderator View

Admin Reports list and detail show:

- reporter user: display name, Amoria ID, user ID, and email;
- target owner/user when stored: display name, Amoria ID, user ID, and email;
- target type and target ID;
- reason and comment;
- status;
- created and updated timestamps;
- action audit history.

The report DTO also includes `targetContext`, a safe context block with a summary, privacy note, and available admin actions.

## Target Context Actions

Available safe actions:

- reporter profile: opens Admin Users search by reporter Amoria ID;
- target owner profile: opens Admin Users search by target owner Amoria ID;
- target user report: opens Admin Users search by target user ID;
- media report: opens Admin Media detail by media ID with an audit reason of `Safety report <reportId>`;
- Together/session report: opens Admin Together Sessions filtered by session ID;
- Nearby report: opens Admin Ops Health / Nearby diagnostics.

Chat thread and message reports show the target type and target ID, but the dedicated safe chat-thread/message admin view does not exist yet. That is intentionally documented instead of exposing private chat payloads through reports.

## Report Actions And Audit

Supported report actions:

- `mark_under_review`
- `dismiss`
- `resolve`
- `escalate`
- `add_note`
- `assign`

Owner and moderator roles can perform status-changing report actions. Support can add an internal note only. Unauthorized roles are blocked server-side.

Every report action writes:

- `report_review_actions` row with admin ID, action, reason, note, sanitized metadata, previous status, next status, and timestamp;
- `admin_audit_log` row with admin ID, action, reason/note, previous status, next status, target report ID, request context, and timestamp.

## Privacy Contract

Reports and target context do not expose:

- exact coordinates;
- exact birth date;
- locked gallery media;
- private credentials;
- signed URLs;
- password hashes or refresh tokens.

Media target links use the existing Admin Media guarded detail/content routes. Locked media still requires elevated role plus reason and remains audited.

## Evidence Status

Screenshot/evidence upload is not implemented in this task. Future task:

`REPORT-EVIDENCE-ATTACHMENTS-01`

The future implementation must store evidence through a safe audited backend path and must not expose signed URLs or locked gallery content through the report response.

## Commands Run

- `npm run typecheck`: pass.
- `npm run admin:web:build`: pass.
- `npm test`: first run found one privacy-test failure because the safe-context note contained the literal word checked by the existing secret-leak test; wording was changed and the second run passed `211/211`.
- `git diff --check`: pass.

## Build Impact

- Backend restart: yes, server/admin API response and Admin Web bundle changed.
- Admin build: yes.
- DB migration: no.
- EAS rebuild: no.
- Metro cache clear: no.
