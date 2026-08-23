import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

test("production Compose builds and serves Admin Web only through a loopback port", () => {
  const compose = read("docker-compose.prod.yml");
  assert.match(compose, /\r?\n  admin-web:\r?\n/);
  assert.match(compose, /context: \.\/admin-web/);
  assert.match(compose, /VITE_ADMIN_API_URL: \$\{PUBLIC_API_URL:\?PUBLIC_API_URL is required\}/);
  assert.match(compose, /ADMIN_API_ORIGIN: \$\{PUBLIC_API_URL:\?PUBLIC_API_URL is required\}/);
  assert.match(compose, /127\.0\.0\.1:\$\{ADMIN_WEB_HOST_PORT:-4174\}:8080/);
  assert.match(compose, /ADMIN_WEB_BIND_HOST: 0\.0\.0\.0/);
  assert.match(compose, /ADMIN_WEB_ALLOW_ALL_INTERFACES: "true"/);
  assert.match(compose, /fetch\('http:\/\/127\.0\.0\.1:8080\/health'\)/);
  assert.match(compose, /read_only: true/);
});

test("Admin Web release image is pinned, unprivileged, and rejects a non-HTTPS API origin", () => {
  const dockerfile = read("admin-web/Dockerfile");
  assert.match(dockerfile, /^FROM node:22\.22\.0-bookworm-slim@sha256:[a-f0-9]{64} AS build/m);
  assert.match(dockerfile, /RUN npm ci/);
  assert.match(dockerfile, /url\.protocol!==['"]https:['"]/);
  assert.match(dockerfile, /url\.origin!==value/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /CMD \["node", "server\.mjs"\]/);
  assert.doesNotMatch(dockerfile, /vite preview|vite --host/);
});

test("Admin Web runtime has a health identity, SPA fallback, and browser hardening", () => {
  const server = read("admin-web/server.mjs");
  assert.match(server, /requestUrl\.pathname === "\/health"/);
  assert.match(server, /JSON\.stringify\(\{ ok: true, releaseSha \}\)/);
  assert.match(server, /RELEASE_SHA must be a full lowercase Git SHA/);
  assert.match(server, /resolveAsset\("\/index\.html"\)/);
  assert.match(server, /Content-Security-Policy/);
  assert.match(server, /frame-ancestors 'none'/);
  assert.match(server, /X-Content-Type-Options/);
  assert.match(server, /ADMIN_WEB_BIND_HOST must be an explicit IP address/);
  assert.match(server, /ADMIN_WEB_ALLOW_ALL_INTERFACES=true/);
  assert.match(server, /const host = adminWebBindHost/);
  assert.match(server, /server\.listen\(port, host/);
  assert.doesNotMatch(server, /server\.listen\(port, "0\.0\.0\.0"/);
  assert.match(server, /startsWith\(`\$\{distDirectory\}\$\{path\.sep\}`\)/);

  const vite = read("admin-web/vite.config.ts");
  assert.match(vite, /sourcemap: false/);

  const api = read("admin-web/src/api.ts");
  assert.match(api, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(api, /\/media\\\/public\\\/\[\^\/\?#\]\+\$/);
  assert.doesNotMatch(api, /return normalized;/);
});

test("production example and runbook wire an exact Admin origin without wildcards", () => {
  const environment = read(".env.production.example");
  assert.match(environment, /^ADMIN_WEB_IMAGE=registry\.example\/amoria-admin-web$/m);
  assert.match(environment, /^PUBLIC_API_URL=https:\/\/api\.example\.com$/m);
  assert.match(environment, /^CORS_ALLOWED_ORIGINS=https:\/\/admin\.example\.com$/m);
  assert.doesNotMatch(environment, /^CORS_ALLOWED_ORIGINS=.*\*/m);

  const deployment = read("docs/DEPLOYMENT.md");
  assert.match(deployment, /https:\/\/admin\.example\.com\/health/);
  assert.match(deployment, /role's allowed\/denied navigation and mutation controls/);
});
