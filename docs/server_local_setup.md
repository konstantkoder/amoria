# Server Local Setup

## Prerequisites

- Node.js 22 or newer
- npm
- Docker and Docker Compose
- curl for endpoint checks

## Environment

Copy the root example file and change secrets before production:

```bash
cp .env.example .env
```

The default `DATABASE_URL` uses host `postgres` because Docker Compose runs the API and database on the same Compose network. The default `S3_ENDPOINT` uses host `minio` for the same reason. If you run `npm run dev` directly on the host while PostgreSQL and MinIO are in Docker, set `DATABASE_URL=postgres://amoria:amoria_password@localhost:5432/amoria` and `S3_ENDPOINT=http://localhost:9000` in your shell.

## Install Dependencies

```bash
npm install
```

## Run Migrations

Docker Compose runs migrations before starting the API container. For direct local Node development, start PostgreSQL first and then run:

```bash
DATABASE_URL=postgres://amoria:amoria_password@localhost:5432/amoria S3_ENDPOINT=http://localhost:9000 npm run db:migrate
```

## Start With Docker Compose

From the repo root:

```bash
docker compose up -d --build
docker compose exec api npm run db:migrate
docker compose logs -f api
```

Data lives in:

- PostgreSQL volume: `amoria_postgres_data`
- MinIO volume: `amoria_minio_data`
- Uploads bind mount: `./uploads`

## Test Health

```bash
curl http://localhost:4000/health
```

Expected shape:

```json
{"ok":true,"service":"amoria-api","time":"..."}
```

## Test MinIO

Open `http://localhost:9001` and sign in with `minioadmin` / `minioadmin`.
The Compose init job creates bucket `amoria` and allows anonymous downloads.

## Connect Mobile Client

Use your PC LAN IP address, not `localhost`, from a physical phone:

```bash
EXPO_PUBLIC_API_URL=http://<LAN_IP_PC>:4000
EXPO_PUBLIC_WS_URL=ws://<LAN_IP_PC>:4000/ws
```

## Test Register And Login

```bash
REGISTER_EMAIL="<real-email>"
REGISTER_PASSWORD="<strong-password>"
DISPLAY_NAME="<display-name>"
curl -s http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$REGISTER_EMAIL\",\"password\":\"$REGISTER_PASSWORD\",\"displayName\":\"$DISPLAY_NAME\"}"
```

```bash
curl -s http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$REGISTER_EMAIL\",\"password\":\"$REGISTER_PASSWORD\"}"
```

Save the returned `accessToken` for authenticated calls.

## Test Avatar Upload

```bash
TOKEN="<access-token-from-login>"
AVATAR_FILE="/absolute/path/to/avatar.jpg"
curl -s http://localhost:4000/media/avatar \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$AVATAR_FILE"
```

The processed avatar is decoded, resized to a 512x512 WebP, and stored in MinIO.
The returned `avatarUrl` uses the backend public media route, for example:

`/media/public/{mediaId}`

Stored object-storage or old local URLs are legacy/debug metadata only. Public
profile, mobile, and Admin Web responses should derive current media URLs from
the media id.

## Backups

Create a PostgreSQL dump:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U amoria amoria > backups/amoria_$(date +%F).sql
```

Archive legacy local uploads while old `/media/...` avatar URLs still exist:

```bash
mkdir -p backups
tar -czf backups/uploads_$(date +%F).tgz -C . uploads
```

Store both backups off-machine before moving hosts or production cutovers.

## Stop And Restart

```bash
docker compose down
docker compose up -d
docker compose restart api
```

## Moving Later To A VPS

Point `api.amoria.app` at the VPS, copy the Compose files, restore the PostgreSQL dump, restore the S3-compatible bucket or MinIO volume, restore legacy `uploads` only while old local avatar URLs still exist, set production secrets in `.env`, and run the same API image behind TLS. The mobile app should keep using the stable API URL instead of a physical server address.
