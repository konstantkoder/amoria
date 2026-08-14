import { createServer } from "node:http";
import { createHash } from "node:crypto";

if (process.env.CONFIRM_EXPO_STUB !== "I_CONFIRM_NON_PRODUCTION") {
  throw new Error("CONFIRM_EXPO_STUB=I_CONFIRM_NON_PRODUCTION is required");
}
const port = Number.parseInt(process.env.EXPO_STUB_PORT || "4500", 10);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("EXPO_STUB_PORT must be 1024..65535");
const host = process.env.EXPO_STUB_HOST || "127.0.0.1";
if (host !== "127.0.0.1" && host !== "0.0.0.0") throw new Error("EXPO_STUB_HOST must be a local bind address");

const server = createServer(async (request, response) => {
  try {
    const body = await readJson(request);
    if (request.url === "/--/api/v2/push/send" && request.method === "POST") {
      const messages = Array.isArray(body) ? body : [body];
      return sendJson(response, 200, {
        data: messages.map((message, index) => ({
          status: "ok",
          id: `stub-${digest(`${String(message?.to ?? "")}:${index}`)}`,
        })),
      });
    }
    if (request.url === "/--/api/v2/push/getReceipts" && request.method === "POST") {
      const ids = Array.isArray(body?.ids) ? body.ids : [];
      return sendJson(response, 200, {
        data: Object.fromEntries(ids.map((id) => [String(id), { status: "ok" }])),
      });
    }
    sendJson(response, 404, { error: "not_found" });
  } catch {
    sendJson(response, 400, { error: "invalid_request" });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`${JSON.stringify({ ready: true, host, port, nonProductionOnly: true })}\n`);
});

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_048_576) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
}

function digest(value) { return createHash("sha256").update(value).digest("hex").slice(0, 24); }
function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
