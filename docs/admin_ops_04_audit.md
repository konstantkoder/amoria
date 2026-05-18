# ADMIN-OPS-04 Audit

Updated: 2026-05-18

## Scope

ADMIN-OPS-04 hardens the Admin/Ops Console for release testing and operational cleanup without mock data, destructive client-error deletes, Firebase fallback, or local-only success.

## Client Error Lifecycle

`client_error_reports` now has a status lifecycle:

- `open`: new or reopened client error.
- `resolved`: admin reviewed and considers the error fixed or handled.
- `ignored`: admin reviewed and intentionally ignores the error.
- `archived`: old/noisy error hidden from the default working queue.

Resolution fields:

- `resolvedAt`
- `resolvedByAdminUserId`
- `resolutionNote`
- `updatedAt`

Reopen sets status back to `open` and clears `resolvedAt`, `resolvedByAdminUserId`, and `resolutionNote`.

## Admin Action Endpoints

Single item action:

```text
POST /admin/client-errors/:id/actions
```

Body:

```json
{
  "action": "resolve | ignore | archive | reopen",
  "note": "optional note"
}
```

Allowed roles: `owner`, `support`, `ops`.

Every action writes `admin_audit_log`:

- `action`: `admin.clientErrors.action`
- `targetType`: `client_error_report`
- `targetId`: report id
- metadata: action, previousStatus, nextStatus

## Bulk Archive Behavior

Bulk action:

```text
POST /admin/client-errors/actions/bulk
```

Body:

```json
{
  "action": "archive | resolve | ignore",
  "filters": {
    "screen": "optional",
    "action": "optional",
    "code": "optional",
    "amoriaId": "optional",
    "status": "optional"
  },
  "note": "optional note"
}
```

The server applies a hard cap of 500 affected rows. This is the supported cleanup path for old release/test errors. It does not delete rows and writes `admin.clientErrors.bulkAction` to the audit log with filters, count, and cap.

## Admin Client Error Feed

`GET /admin/client-errors` includes:

- existing filters: `screen`, `action`, `code`, `amoriaId`, `userId`, `limit`
- new filters: `status`, `createdFrom`, `createdTo`
- lifecycle fields in each item

The Admin Web default filter is `status=open`.

## Ops Health

`GET /admin/ops/health` returns real backend data only:

- API/service identity and time
- `nodeEnv`
- database connectivity status
- open client error count
- open report count
- pending media moderation item count where available
- object storage status

Object storage is explicitly returned as `not_checked` until a safe non-mutating storage health check is wired. The response does not expose raw env, `DATABASE_URL`, S3 keys, tokens, or secrets.

## Admin Users Endpoint

`GET /admin/admin-users` is owner-only.

It returns safe admin users and roles:

- admin user id
- linked user id
- admin email/display name
- status
- roles
- linked public user snapshot
- created/updated timestamps

It does not expose password hashes, refresh tokens, or secrets. Reads write `admin.adminUsers.read` to audit.

Role editing remains a blocker and was not implemented in this block.

## Russian Admin Web

Admin Web now has product localization, not browser translation:

- `admin-web/src/i18n/en.ts`
- `admin-web/src/i18n/ru.ts`
- `admin-web/src/i18n/index.ts`

The English and Russian dictionaries are type-checked to have the same keys. Visible admin UI labels, navigation, login, dashboard, users, client errors, reports, media moderation, audit log, ops health, bootstrap guide, buttons, filters, empty states, statuses, roles, actions, and confirmations use translations.

Technical endpoint names, error codes, and raw JSON payload field names remain as-is where useful.

## Switch Language

Use the language selector in the Admin Web login screen or top bar:

- `English`
- `Русский`

The selected language is persisted in `localStorage` under the admin web origin.

## Safe Cleanup Workflow

1. Open Admin Web.
2. Go to Client Errors.
3. Keep the default `Open` status or narrow by screen/action/code/Amoria ID.
4. Enter an optional note.
5. Click `Archive current filtered errors`.
6. Confirm the action.

Rows are archived, not deleted. The audit log records the filters and affected count.

## Remaining Blockers

- Wire a safe object storage health check without exposing secrets.
- Add role editing/role assignment UI and backend policy.
- Complete a real owner login smoke pass against the target environment.
- Complete release smoke pass for reports/media moderation with real generated data.
- Add rate limit / anti-spam visibility.
