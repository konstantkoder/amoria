# ADMIN-OPS-02 Error Reporting

Updated: 2026-05-16

## Endpoint list

Client endpoint:

- `POST /client/error-reports`

Admin endpoint:

- `GET /admin/client-errors?limit=50&screen=&action=&code=&amoriaId=&userId=`

The client endpoint supports optional auth. If a valid bearer token is present, the report stores a user snapshot. If no auth token is present, the report is stored anonymously. If an invalid token is present, the request follows backend auth security and is rejected instead of trusting the token.

## DB table

Server migration:

- `src/db/migrations/0012_client_error_reports.sql`

Table:

- `client_error_reports`

Indexes:

- `created_at`
- `user_id`
- `amoria_id`
- `screen`
- `action`
- `code`

Stored user fields are snapshots for support/admin diagnostics only: `userId`, `amoriaId`, `displayName`, and `email` when a valid authenticated user exists.

## Mobile integration points

- `src/services/api/clientErrorsApi.ts`
- `src/services/storage.ts`
- `src/services/media/uploadPut.ts`
- `src/screens/PhotoManagerScreen.tsx`
- `src/screens/ProfileScreen.tsx`

Profile photo upload failures report:

- `screen`: `PhotoManagerScreen`
- `action`: `uploadProfilePhoto`
- `step`: `getInfo`, `prepareUpload`, `putUpload`, `completeUpload`, `mapMedia`, or `refreshGallery`

Avatar upload failures report:

- `screen`: `ProfileScreen`
- `action`: `uploadAvatar`
- `step`: known upload/session step when available

## Redaction rules

Server and mobile sanitize metadata before storage/transmission.

Redacted key patterns include:

- password
- token
- secret
- authorization
- cookie
- jwt
- refresh
- accessToken
- refreshToken
- s3
- database
- connection
- privateKey
- lockedGalleryPassword
- folderPassword
- accountPassword

Reports must not store passwords, access tokens, refresh tokens, JWTs, cookies, `.env`, S3 keys, `DATABASE_URL`, raw headers, full signed upload URLs, or raw local file paths.

Long strings, deep objects, large arrays, and overly large metadata are truncated.

## Admin role policy

Allowed to read client errors:

- `owner`
- `support`
- `ops`

`moderator` is not included in `ADMIN-OPS-02` because client errors may contain support/diagnostic context beyond moderation scope.

Reading the feed writes an admin audit entry:

- action: `admin.clientErrors.read`
- metadata: filters, limit, result count

## Photo upload debugging

After reproducing the current profile photo bug, query the protected admin endpoint:

```text
GET /admin/client-errors?screen=PhotoManagerScreen&action=uploadProfilePhoto&limit=20
```

Expected useful fields:

- `step`: identifies whether the failure happened at `prepareUpload`, `putUpload`, `completeUpload`, or `refreshGallery`
- `code`: stable client/backend error code when available
- `metadata.fileSize`
- `metadata.mimeType`
- `metadata.uriScheme`
- `metadata.uploadUrlHost`
- `metadata.status`

The full local file path and full signed upload URL are intentionally not stored.

## Remaining blockers for ADMIN-OPS-03

- Build the real admin web panel shell.
- Add authenticated admin UI access to user search and client error feed.
- Add operator-friendly filters and detail views for error reports.
- Add request correlation IDs across mobile API calls where useful.
- Decide whether separate admin auth/session endpoints are needed beyond existing user auth plus admin membership guard.
