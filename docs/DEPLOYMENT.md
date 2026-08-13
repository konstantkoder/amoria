# Amoria 1.0 server deployment

This procedure deploys an exact release commit with `docker-compose.prod.yml`. It is an operator runbook; this audit did not execute it on a VPS.

## Preconditions

- Work from a clean checkout whose `HEAD` is the approved server RC SHA.
- Install Docker Engine with Compose v2 and ensure the reverse proxy alone owns public 80/443.
- Keep `.env.production` outside Git, mode `0600`, owned by the deployment account. Start from `.env.production.example` and replace every placeholder.
- Provision the three local model files at the configured read-only host directories and verify their published checksums.
- Set `API_IMAGE`, `ADMIN_WEB_IMAGE`, and `PHOTO_WORKER_IMAGE` to immutable registry repositories. Set `RELEASE_SHA` to the full 40-character commit; never deploy `latest`.
- Create a root-only backup directory outside the web root and outside Docker volumes, for example `/var/backups/amoria`.

Production must provide exact HTTPS public URLs, unique high-entropy JWT/HMAC/S3 secrets, SMTP settings, a precise CORS allowlist, and a bounded `TRUST_PROXY` matching the real reverse-proxy hop or IP/CIDR. The runtime and migration database URLs must use their separate roles.

## 1. Preflight and identity

```sh
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$RELEASE_SHA"
docker compose --env-file .env.production -f docker-compose.prod.yml config >/dev/null
docker compose version
docker version
```

Record the release SHA, UTC build timestamp, image tags, and the resulting image digests in the change ticket.

## 2. Consistent-enough MVP backup

The database and object store cannot be snapshotted transactionally together. Put the API and photo worker in a short maintenance window, then back up DB first and media immediately afterward. This creates a documented consistency window rather than claiming atomicity.

```sh
backup_dir="/var/backups/amoria/$(date -u +%Y%m%dT%H%M%SZ)-$RELEASE_SHA"
install -d -m 0700 "$backup_dir/media"

docker compose --env-file .env.production -f docker-compose.prod.yml stop api photo-worker
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U amoria_migrator -d amoria -Fc' \
  >"$backup_dir/amoria.dump"

docker run --rm --network amoria-production_backend \
  --env-file .env.production \
  --mount "type=bind,source=$backup_dir/media,target=/backup" \
  minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727 \
  sh -ec 'mc alias set src http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null; mc mirror --overwrite src/amoria /backup'

sha256sum "$backup_dir/amoria.dump" >"$backup_dir/SHA256SUMS"
find "$backup_dir/media" -type f -print0 | sort -z | xargs -0 sha256sum >>"$backup_dir/SHA256SUMS"
chmod -R go-rwx "$backup_dir"
```

Record PostgreSQL version, latest migration, release SHA, sizes, object count, checksums, and elapsed time. Copy the encrypted backup off-machine before considering the backup complete. Do not web-serve this directory.

## 3. Build or pull exact artifacts

Preferred CI flow: build once, scan, push the SHA tag, record its registry digest, then pull by that exact tag/digest on the server.

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml build migrate admin-web photo-worker
docker image inspect "$API_IMAGE:$RELEASE_SHA" --format '{{json .RepoDigests}}'
docker image inspect "$ADMIN_WEB_IMAGE:$RELEASE_SHA" --format '{{json .RepoDigests}}'
docker image inspect "$PHOTO_WORKER_IMAGE:$RELEASE_SHA" --format '{{json .RepoDigests}}'
```

The API and Admin Web images embed the safe release identifier. Admin Web is compiled against the exact public API HTTPS origin, uses a dependency-free production static server, and does not publish source maps or a Vite development server. Application images use pinned base digests and unprivileged users.

## 4. Controlled migration and start

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres minio minio-init api admin-web photo-worker
```

The migration service uses the migration role and PostgreSQL advisory locking. The API uses the restricted runtime role and never auto-migrates in production.

## 5. Readiness and smoke

Through the real TLS endpoint, verify:

```sh
curl --fail --silent https://api.example.com/health/live
curl --fail --silent https://api.example.com/health/ready
curl --fail --silent https://api.example.com/version
curl --fail --silent https://admin.example.com/health
```

The API version and Admin Web health SHA must equal the approved `RELEASE_SHA`; readiness must report DB and object storage healthy. In a browser at the real Admin HTTPS origin, verify login, refresh continuity, logout, and each role's allowed/denied navigation and mutation controls. Then perform one QA profile/inbox read, normal message with WebSocket receipt, Nearby read, public-media read, and locked-media denial/authorized access. Check logs and Admin Client Errors for at least 15 minutes.

## Backup schedule and retention

- PostgreSQL custom-format dump every 6 hours; keep 7 days locally.
- Daily media mirror/snapshot in the same maintenance/consistency sequence; keep 14 daily and 8 weekly copies.
- Copy every completed backup off-machine, encrypted with a key not stored beside the backup.
- Verify checksums after copy. Run a disposable restore monthly and after migration-heavy releases.
- Alert on missing/zero-sized dumps, checksum mismatch, object-count collapse, insufficient disk, or an overdue off-machine copy.

The proposed release RPO is 6 hours for database state and 24 hours for media unless a provider snapshot schedule improves it. Local QA observed a 0.326 s DB dump, 0.834 s media mirror, and 19.22 s full restore/start; these are not VPS performance claims.

## Reverse proxy and operations

- Route the public API HTTPS host to the loopback-bound API port and enable WebSocket upgrade. Route the separate Admin HTTPS host to the loopback-bound Admin Web port. Do not expose either loopback port directly.
- Set `PUBLIC_API_URL` to the exact API HTTPS origin and `CORS_ALLOWED_ORIGINS` to the exact Admin HTTPS origin. Do not use wildcards with credentialed Admin requests.
- Enforce HTTPS redirect, TLS renewal, request-body limits matching the API, and the exact real-client-IP topology represented by `TRUST_PROXY`.
- Do not publish PostgreSQL, MinIO API/console, or an Admin development server.
- Compose rotates JSON logs at 10 MiB × 5 files per long-running service. Monitor Docker data, Postgres, MinIO, journal, and backup disk growth.
- Configure SPF, DKIM, DMARC, PTR/rDNS, and monitored SMTP delivery before production email is relied upon.

Use [ROLLBACK.md](./ROLLBACK.md) for any failed readiness, version mismatch, migration incompatibility, or smoke-test failure.
