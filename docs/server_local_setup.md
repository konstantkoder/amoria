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

The default `DATABASE_URL` uses host `postgres` because Docker Compose runs the API and database on the same Compose network. If you run `npm run dev` directly on the host while PostgreSQL is in Docker, set `DATABASE_URL=postgresql://amoria:amoria_password@localhost:5432/amoria` in your shell or in `.env`.

## Install Dependencies

```bash
npm install
```

## Run Migrations

Docker Compose runs migrations before starting the API container. For direct local Node development, start PostgreSQL first and then run:

```bash
DATABASE_URL=postgresql://amoria:amoria_password@localhost:5432/amoria npm run db:migrate
```

## Start With Docker Compose

From the repo root:

```bash
docker compose up -d --build
docker compose logs -f api
```

Data lives in:

- PostgreSQL volume: `amoria_postgres_data`
- Uploads bind mount: `./uploads`

## Test Health

```bash
curl http://localhost:4000/health
```

Expected shape:

```json
{"ok":true,"service":"amoria-api","time":"..."}
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

The processed avatar is saved as:

`uploads/users/{userId}/avatar.webp`

It is served locally at:

`http://localhost:4000/media/users/{userId}/avatar.webp`

## Backups

Create a PostgreSQL dump:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U amoria amoria > backups/amoria_$(date +%F).sql
```

Archive uploads:

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

Point `api.amoria.app` at the VPS, copy the Compose files, restore the PostgreSQL dump, restore `uploads`, set production secrets in `.env`, and run the same API image behind TLS. The mobile app should keep using the stable API URL instead of a physical server address.
