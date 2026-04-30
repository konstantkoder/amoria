# Amoria API

Independent backend foundation for Amoria. This service does not remove Firebase and does not migrate chats, Together, Nearby, or Announcements yet.

## Stack

- Node.js + TypeScript
- Fastify
- PostgreSQL
- Drizzle ORM migrations
- JWT access tokens
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
- `GET /me`
- `PATCH /me/profile`
- `POST /media/avatar`
- `GET /media/users/:userId/avatar.webp`

Errors use a consistent envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Human readable message",
    "fields": {
      "email": "invalid"
    }
  }
}
```

## Local Development

From the repo root:

```bash
cp .env.example .env
docker compose up -d --build
```

For direct Node development:

```bash
cd server
npm install
DATABASE_URL=postgresql://amoria:amoria_password@localhost:5432/amoria npm run db:migrate
DATABASE_URL=postgresql://amoria:amoria_password@localhost:5432/amoria npm run dev
```

Uploaded avatars are processed to WebP and stored under `server/uploads/users/{userId}/avatar.webp`.
