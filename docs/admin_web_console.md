# Admin Web Console

Updated: 2026-05-16 after `ADMIN-OPS-03-FULL`

The Admin/Ops Control Center is a real backend-backed web console in the server repo:

```text
F:\Dev\AmoriaServer\admin-web
```

It does not use mock users, mock reports, mock errors, fake counters, or local-only admin success. Login must pass `/auth/login` and then `/admin/me`.

## How to run

From `F:\Dev\AmoriaServer`:

```text
npm run admin:web:dev
```

Build check:

```text
npm run admin:web:build
```

API config:

- `VITE_ADMIN_API_URL` points the web console to the backend API.
- If `VITE_ADMIN_API_URL` is empty, the console uses same-origin API paths.
- No secrets are stored in the web app config.

## Create owner admin account

From `F:\Dev\AmoriaServer`:

```text
npm run admin:create-owner
```

Supported env:

- `ADMIN_OWNER_EMAIL`
- `ADMIN_OWNER_PASSWORD`
- `ADMIN_OWNER_DISPLAY_NAME`

If `ADMIN_OWNER_EMAIL` is empty, local dev default is `owner@amoria.local`. Production must set a real email.

If `ADMIN_OWNER_PASSWORD` is empty, the script generates a strong password and saves it outside the repo:

```text
F:\Dev\AmoriaAdminSecrets\owner-admin-YYYY-MM-DD_HH-mm-ss.txt
```

Do not commit or paste this file into logs.

## Login

1. Open the admin web console.
2. Sign in with the owner admin email and password.
3. The console calls `/admin/me`.
4. If `/admin/me` returns 403, the account is not an active Admin/Ops user.

Refresh-token support is implemented through `/auth/refresh`. Logout clears local admin web tokens and calls `/auth/logout`.

## Users

Use the Users screen for support lookup by:

- Amoria ID
- text query

The screen reads `GET /admin/users` and shows Amoria ID, display name, email, avatar URL, created time, and updated time.

## Client Errors

The Client Errors screen reads `GET /admin/client-errors`.

Filters:

- screen
- action
- code
- Amoria ID
- limit

Use `Photo upload errors` to load:

```text
screen=PhotoManagerScreen
action=uploadProfilePhoto
```

For the current upload bug, inspect `step`, `code`, `message`, `metadata.uploadUrlHost`, `metadata.status`, `backendUrl`, and `requestId`.

## Reports

The Reports screen reads:

- `GET /admin/reports`
- `GET /admin/reports/:id`
- `POST /admin/reports/:id/actions`

Supported actions:

- `assign`
- `mark_under_review`
- `dismiss`
- `resolve`
- `escalate`
- `add_note`

No fake report rows are shown. Empty tables mean the backend has no matching reports.

## Media Moderation

The Media Moderation screen reads:

- `GET /admin/media`
- `GET /admin/media/:mediaId`
- `POST /admin/media/:mediaId/decision`

Supported decisions:

- `approve`
- `restrict`
- `remove`
- `mark_under_review`

Locked gallery media requires owner/moderator access plus a reason before detail URLs are returned. Viewing locked media writes an audit log entry.

## Audit Log

The Audit Log screen reads `GET /admin/audit-log`.

This screen is owner-only. It shows action, admin user, target, reason, request ID, IP, user agent, timestamp, and metadata detail.

## Photo Upload Debugging

1. Reproduce the profile photo upload failure in mobile.
2. Open Client Errors.
3. Click `Photo upload errors`.
4. Inspect the newest item.
5. The useful failure step should be one of `getInfo`, `prepareUpload`, `putUpload`, `completeUpload`, `mapMedia`, or `refreshGallery`.

The app intentionally does not store full signed upload URLs, auth tokens, refresh tokens, passwords, S3 keys, full local paths, or raw `.env` values.
