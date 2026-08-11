FROM node:22.22.0-bookworm-slim@sha256:7cc56ef285a8568121537d17b05e72128f01b89c54607b51acf084a50ef483f3 AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM deps AS build

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM deps AS prod-deps

RUN npm prune --omit=dev

FROM python:3.13.13-slim-bookworm@sha256:f576b530293e74140ea91d262232648d5c4f45640a95ec447757701bfcacf034 AS runner

ARG RELEASE_SHA=development
ARG APP_VERSION=0.1.0

WORKDIR /app
ENV NODE_ENV=production
ENV RELEASE_SHA=${RELEASE_SHA}
ENV APP_VERSION=${APP_VERSION}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      libgnutls30=3.7.9-2+deb12u7 \
      libssl3=3.0.20-1~deb12u2 \
      openssl=3.0.20-1~deb12u2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /usr/local/bin/node /usr/local/bin/node
COPY package*.json ./
COPY --from=prod-deps /app/node_modules ./node_modules

COPY scripts ./scripts
COPY --from=build /app/dist ./dist
COPY src/db/migrations ./dist/src/db/migrations
COPY src/email/disposable-domains.txt ./dist/src/email/disposable-domains.txt
COPY moderation-worker/text-requirements.lock /tmp/text-requirements.lock
RUN python3 -m pip install --break-system-packages --no-cache-dir -r /tmp/text-requirements.lock \
    && rm /tmp/text-requirements.lock
COPY moderation-worker/text_worker.py ./moderation-worker/text_worker.py

RUN groupadd --system amoria \
    && useradd --system --gid amoria --home-dir /app amoria \
    && mkdir -p /app/uploads \
    && chown -R amoria:amoria /app

USER amoria
EXPOSE 4000

CMD ["node", "dist/src/server.js"]
