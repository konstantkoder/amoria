# Amoria API

Standalone backend foundation for Amoria. It contains the API, PostgreSQL schema, auth/profile/media flows, and local upload handling only.

## Stack

- Node.js + TypeScript
- Fastify
- PostgreSQL
- Drizzle ORM migrations
- JWT access tokens
- Rotating hashed refresh tokens
- Argon2id password hashing with bcrypt fallback
- Sharp avatar processing
- Local file uploads

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

## Environment

- `PORT`: API port, default local value `4000`
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: long random secret for access tokens
- `PUBLIC_API_URL`: public API base URL
- `PUBLIC_MEDIA_URL`: public media base URL
- `UPLOADS_DIR`: local upload directory controlled by the server
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
docker compose up -d --build
```

For direct Node development:

```bash
npm install
DATABASE_URL=postgresql://amoria:amoria_password@localhost:5432/amoria npm run db:migrate
DATABASE_URL=postgresql://amoria:amoria_password@localhost:5432/amoria npm run dev
```

Uploaded avatars are processed to WebP and stored under `uploads/users/{userId}/avatar.webp`.
