# Amoria 1.0 server rollback

Rollback always targets an immutable previously recorded image/SHA. Do not rebuild an old mutable branch and do not run ad-hoc reverse SQL.

## Immediate containment

1. Remove the failing API from reverse-proxy traffic or stop only `api` and `photo-worker`.
2. Preserve logs, release/version output, migration output, and the pre-deploy backup checksums.
3. Decide whether the migration completed and whether the previous code was proven compatible with the resulting schema.

## Case A: code rollback, schema compatible

Use this when no migration ran, migration failed before change, or the exact previous image has been tested against the current forward-compatible schema.

```sh
export RELEASE_SHA='<previous-full-sha>'
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps api photo-worker
curl --fail --silent https://api.example.com/health/ready
curl --fail --silent https://api.example.com/version
```

Require the previous SHA in `/version`, then repeat auth, profile/inbox, chat/WebSocket, Nearby, public/locked media, and Admin smoke checks. Monitor errors before reopening traffic.

Local audit evidence: exact image `amoria-api:preauth-ec3f182` started and returned healthy after the current 0032 schema was applied, so the tested historical code rollback is compatible with that schema. This does not grant blanket compatibility to every future migration.

## Case B: migration makes old code unsafe

Use this if the previous image fails its compatibility smoke or the migration changed semantics/destructively transformed data.

1. Stop API and workers; keep Postgres and MinIO available only to the operator restore network.
2. Preserve the failed database/media state for incident analysis if disk permits.
3. Verify the selected pre-deploy DB and media backup checksums.
4. Restore into new empty volumes first; never restore over the only copy.
5. Restore PostgreSQL with `pg_restore --exit-on-error --no-owner --no-privileges`.
6. Mirror media into the new private bucket and explicitly keep anonymous policy `none`.
7. Start the exact previous images against the restored volumes.
8. Verify representative counts, login, threads/messages/moderation history, Nearby, Together, Admin audit, public media, locked-media denial/authorized access, migration journal, readiness, and version SHA.
9. Switch the compose volume references or traffic only after verification.

Do not attempt automatic down-migrations: the repository has no independently tested down-migration chain.

## Failure simulations proven locally

- A production process with missing/sample secrets refuses startup.
- Current migrations completed on an old 0028 database; the exact previous `ec3f182` API still started healthy afterward.
- A custom-format database backup plus private media mirror was restored after the source containers and volumes were destroyed. Login, admin role, chat, moderation state/history, Nearby, Together, audit, public media, locked-media privacy, objects, and readiness passed.
- A truncated backup copy was rejected by `pg_restore` tooling.

If neither rollback path can be verified, keep traffic closed and restore from the last known-good paired DB/media backup.
