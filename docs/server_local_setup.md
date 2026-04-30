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

The default `DATABASE_URL` uses host `postgres` because Docker Compose runs the API and database on the same Compose network. If you run `npm run dev` directly on the host while PostgreSQL is in Docker, set `DATABASE_URL=postgresql://amoria:amoria_password@localhost:5432/amoria` in your shell or in `server/.env`.

## Install Dependencies

```bash
cd server
npm install
```

## Run Migrations

Docker Compose runs migrations before starting the API container. For direct local Node development, start PostgreSQL first and then run:

```bash
cd server
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
- Uploads bind mount: `server/uploads`

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
curl -s http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"StrongPassword123","displayName":"Konstantin"}'
```

```bash
curl -s http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"StrongPassword123"}'
```

Save the returned `accessToken` for authenticated calls.

## Test Avatar Upload

```bash
TOKEN="paste-access-token-here"
curl -s http://localhost:4000/media/avatar \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/avatar.jpg"
```

The processed avatar is saved as:

`server/uploads/users/{userId}/avatar.webp`

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
tar -czf backups/uploads_$(date +%F).tgz -C server uploads
```

Store both backups off-machine before moving hosts or removing Firebase.

## Stop And Restart

```bash
docker compose down
docker compose up -d
docker compose restart api
```

## Moving Later To A VPS

Point `api.amoria.app` at the VPS, copy the Compose files, restore the PostgreSQL dump, restore `server/uploads`, set production secrets in `.env`, and run the same API image behind TLS. The mobile app should keep using the stable API URL instead of a physical server address.
