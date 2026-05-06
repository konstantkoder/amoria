# Amoria API

Standalone backend foundation for Amoria. It contains the API, PostgreSQL schema, auth/profile/media flows, and S3-compatible media storage.

## Stack

- Node.js + TypeScript
- Fastify
- PostgreSQL
- Drizzle ORM migrations
- JWT access tokens
- Rotating hashed refresh tokens
- Argon2id password hashing with bcrypt fallback
- Sharp avatar processing
- S3-compatible media storage with local MinIO

## Scripts

- `npm run dev`: start the API with `tsx watch`
- `npm run build`: compile TypeScript to `dist`
- `npm run start`: run the compiled server
- `npm run typecheck`: run TypeScript checks
- `npm run lint`: currently aliases TypeScript checks
- `npm run test`: run basic endpoint tests
- `npm run db:generate`: generate Drizzle migrations from schema changes
- `npm run db:migrate`: apply Drizzle migrations
- `npm run db:push`: push schema directly for local development only
- `npm run docker:up`: start Docker Compose services
- `npm run docker:down`: stop Docker Compose services
- `npm run docker:logs`: follow API container logs
- `npm run docker:migrate`: run migrations inside the API container
- `npm run docker:dev`: start Docker Compose services and follow API logs

## Environment

- `PORT`: API port, default local value `4000`
- `DATABASE_URL`: PostgreSQL connection string; use host `postgres` inside Docker
- `JWT_SECRET`: long random secret for access tokens
- `PUBLIC_API_URL`: public API base URL
- `PUBLIC_MEDIA_URL`: public media base URL
- `UPLOADS_DIR`: local upload directory controlled by the server
- `OBJECT_STORAGE_PROVIDER`: must be `s3`
- `S3_ENDPOINT`: S3 endpoint for the server; use `http://minio:9000` inside Docker
- `S3_REGION`: S3 region, default local value `us-east-1`
- `S3_ACCESS_KEY`: MinIO/S3 access key
- `S3_SECRET_KEY`: MinIO/S3 secret key
- `S3_BUCKET`: S3 bucket name, default local value `amoria`
- `S3_PUBLIC_BASE_URL`: browser-visible media base URL, default local value `http://localhost:9000/amoria`
- `S3_FORCE_PATH_STYLE`: use `1` for MinIO
- `NODE_ENV`: `development`, `test`, or `production`

## Endpoints

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `GET /me`
- `PATCH /me/profile`
- `GET /users/:id/public`
- `GET /users/by-amoria-id/:amoriaId`
- `POST /media/avatar`
- `GET /media/users/:userId/avatar.webp`

Errors use a consistent envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Human readable message",
    "details": {
      "email": "invalid"
    }
  }
}
```

Successful auth responses include:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "accessTokenExpiresAt": "2026-05-02T12:00:00.000Z",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "displayName": "User",
    "amoriaId": "AM123",
    "avatarUrl": null
  }
}
```

Refresh tokens are stored only as hashes and are rotated on every `POST /auth/refresh`.

Auth lifecycle test cases:

- `login -> refresh -> refresh(old)` returns `401` with code `invalid_refresh`
- `logout -> refresh(token)` returns `401` with code `invalid_refresh`
- `logout-all -> refresh(any)` returns `401` with code `invalid_refresh`

`GET /me` returns the full profile, including private fields:

```json
{
  "id": "...",
  "email": "user@example.com",
  "displayName": "User",
  "about": null,
  "amoriaId": "AM123",
  "avatarUrl": null,
  "photos": [
    {
      "mediaId": "00000000-0000-4000-8000-000000000000",
      "url": "https://api.example.test/media/users/u/photo.webp"
    }
  ],
  "goal": "relationship",
  "mood": "romantic",
  "interests": ["music", "travel"],
  "flirtEnabled": true,
  "allowAdultMode": false,
  "mysteryMode": false,
  "createdAt": "2026-05-02T12:00:00.000Z",
  "updatedAt": "2026-05-02T12:00:00.000Z"
}
```

`PATCH /me/profile` accepts any subset of `displayName`, `about`, `avatarUrl`,
`photos`, `goal`, `mood`, `interests`, `flirtEnabled`, `allowAdultMode`, and
`mysteryMode`. `photos` is capped at 9 items, `interests` at 20 items, and
interest strings are trimmed. `goal` values are `relationship`, `dating`,
`friendship`, `chat`, or `unsure`; `mood` values are `romantic`, `playful`,
`chill`, `curious`, or `adventurous`.

Public profile endpoints return the same profile shape without `email` and
`allowAdultMode`.

## Local Development

From the repo root:

```bash
cp .env.example .env
docker compose up -d
docker compose exec api npm run db:migrate
curl http://localhost:4000/health
```

MinIO console is available at `http://localhost:9001` with `minioadmin` / `minioadmin`.
The local bucket is `amoria`, and public media URLs use `http://localhost:9000/amoria`.

For an Expo mobile client on the same LAN, set:

```bash
EXPO_PUBLIC_API_URL=http://<LAN_IP_PC>:4000
EXPO_PUBLIC_WS_URL=ws://<LAN_IP_PC>:4000/ws
```

For direct Node development:

```bash
npm install
DATABASE_URL=postgres://amoria:amoria_password@localhost:5432/amoria S3_ENDPOINT=http://localhost:9000 npm run db:migrate
DATABASE_URL=postgres://amoria:amoria_password@localhost:5432/amoria S3_ENDPOINT=http://localhost:9000 npm run dev
```

Uploaded avatars are processed to WebP and stored in the configured S3 bucket.
