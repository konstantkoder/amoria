FROM node:22.22.0-bookworm-slim@sha256:7cc56ef285a8568121537d17b05e72128f01b89c54607b51acf084a50ef483f3 AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src

ARG VITE_ADMIN_API_URL
RUN node -e "const value=process.env.VITE_ADMIN_API_URL; const url=new URL(value); if(url.protocol!=='https:' || url.origin!==value) throw new Error('VITE_ADMIN_API_URL must be an exact HTTPS origin')"
RUN npm run build

FROM node:22.22.0-bookworm-slim@sha256:7cc56ef285a8568121537d17b05e72128f01b89c54607b51acf084a50ef483f3 AS runner

ARG RELEASE_SHA=development

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV RELEASE_SHA=${RELEASE_SHA}

COPY --chown=node:node server.mjs ./server.mjs
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 8080

CMD ["node", "server.mjs"]
