import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.join(appDirectory, "dist");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function exactHttpsOrigin(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.origin !== value) {
    throw new Error(`${name} must be an exact HTTPS origin`);
  }
  return parsed.origin;
}

function listenPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  return port;
}

function releaseIdentity(value) {
  if (!/^[a-f0-9]{40}$/u.test(value ?? "")) {
    throw new Error("RELEASE_SHA must be a full lowercase Git SHA");
  }
  return value;
}

function securityHeaders(apiOrigin) {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'none'",
      `connect-src 'self' ${apiOrigin}`,
      "font-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      `img-src 'self' data: blob: ${apiOrigin}`,
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "upgrade-insecure-requests",
    ].join("; "),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function sendText(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/plain; charset=utf-8",
    ...headers,
  });
  response.end(body);
}

async function resolveAsset(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decodedPath.includes("\0")) {
    return null;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^[/\\]+/, "");
  const assetPath = path.resolve(distDirectory, relativePath);
  if (assetPath !== distDirectory && !assetPath.startsWith(`${distDirectory}${path.sep}`)) {
    return null;
  }

  try {
    const assetStat = await stat(assetPath);
    return assetStat.isFile() ? { assetPath, assetStat } : null;
  } catch {
    return null;
  }
}

export function createAdminWebServer(options = {}) {
  const apiOrigin = exactHttpsOrigin(options.apiOrigin ?? process.env.ADMIN_API_ORIGIN, "ADMIN_API_ORIGIN");
  const releaseSha = releaseIdentity(options.releaseSha ?? process.env.RELEASE_SHA);
  const headers = securityHeaders(apiOrigin);

  return createServer(async (request, response) => {
    Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendText(response, 405, "Method Not Allowed\n", { Allow: "GET, HEAD" });
      return;
    }

    let requestUrl;
    try {
      requestUrl = new URL(request.url ?? "/", "http://admin-web.local");
    } catch {
      sendText(response, 400, "Bad Request\n");
      return;
    }

    if (requestUrl.pathname === "/health") {
      const body = JSON.stringify({ ok: true, releaseSha });
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(body),
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }

    let asset = await resolveAsset(requestUrl.pathname);
    if (!asset && !path.extname(requestUrl.pathname)) {
      asset = await resolveAsset("/index.html");
    }
    if (!asset) {
      sendText(response, 404, "Not Found\n");
      return;
    }

    const extension = path.extname(asset.assetPath).toLowerCase();
    const isImmutableAsset = requestUrl.pathname.startsWith("/assets/");
    response.writeHead(200, {
      "Cache-Control": isImmutableAsset ? "public, max-age=31536000, immutable" : "no-cache",
      "Content-Length": asset.assetStat.size,
      "Content-Type": contentTypes.get(extension) ?? "application/octet-stream",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = createReadStream(asset.assetPath);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = listenPort(process.env.PORT ?? "8080");
  const server = createAdminWebServer();
  server.listen(port, "0.0.0.0", () => {
    process.stdout.write(`Amoria Admin Web listening on ${port}\n`);
  });
}
