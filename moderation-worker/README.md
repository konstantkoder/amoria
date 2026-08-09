# Amoria moderation worker

This is a database-backed, non-network-listening worker for avatars and public profile photos.
See [the architecture and operations guide](../docs/local_photo_moderation.md).

Install the pinned runtime with `npm run moderation:install`, configure the database and private S3
settings in `.env`, then run `npm run moderation:worker`. Use `-- --once` for a bounded local QA run.

The worker must not be pointed at user-media directories. It receives only durable job IDs and gets
trusted object keys from PostgreSQL. The model cache belongs outside the media bucket and repository.
