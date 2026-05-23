# Independent Backend Plan

Amoria is moving backend ownership into this standalone API so the app can control its own data model, hosting location, backups, media storage, auth lifecycle, and realtime behavior. This backend does not depend on Firebase.

## Target Architecture

The long-term request path is:

`Mobile app -> https://api.amoria.app -> Amoria API -> PostgreSQL + local uploads + WebSocket`

For local development, the API runs at `http://localhost:4000`. The stable public entry point remains `https://api.amoria.app`, even if the physical server changes later.

## Hosting Path

1. Home PC now: run Docker Compose with the API, PostgreSQL, and persisted upload files.
2. VPS later: move the same Compose stack or equivalent systemd/container setup behind TLS and DNS for `api.amoria.app`.
3. Own physical server later: move the database volume and uploads directory again without changing mobile clients, because clients keep using `api.amoria.app`.

The server location can change; the API DNS name should not.

## Phased Migration

1. Backend foundation: Fastify API, PostgreSQL schema, auth/profile/media endpoints, local uploads, Docker Compose.
2. Mobile profile/media integration: point selected profile and avatar flows at `API_URL`.
3. Custom auth cutover: switch client auth only after backend auth and token storage are ready.
4. Chats: maintain backend persistence, block policy, and realtime delivery.
5. Together queue/draw/story_sparks: continue moving Together matching and shared state to the backend. `color_mood` was removed before public release and new backend queue requests for it are rejected.
6. History: migrate historical play/session records.
7. Nearby/announcements: migrate location-aware and announcement data carefully.
8. Remove old client-side dependencies only after every flow is fully migrated and verified.

## Data And Backups

PostgreSQL is the source of truth for users, auth metadata, media records, and later app data. User-uploaded images such as avatars and profile photos are stored in S3-compatible object storage and exposed through the backend `/media/public/:mediaId` route when public-safe. Backups must include:

- PostgreSQL dumps with `pg_dump`, stored off-machine.
- S3-compatible bucket or MinIO volume backups, stored off-machine.
- Legacy upload directory archives while old local avatar URLs still exist.

Backups should be encrypted when stored outside the trusted server, tested with restore drills, and retained with a clear schedule before any production cutover.

## Security Requirements

- JWT secrets, database credentials, and deployment-specific URLs come from environment variables.
- Plain passwords are never stored; password hashes use Argon2id where available, with bcrypt fallback.
- The server generates Amoria IDs and final upload paths.
- Users cannot choose final file paths, and original large avatar files are not stored.
- Public peer profiles must not expose email addresses later.
- TLS must terminate before production traffic reaches the API.
- Database and upload volumes must be backed up before any hosting move.
