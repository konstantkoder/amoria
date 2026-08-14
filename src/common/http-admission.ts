type UpgradeRequest = {
  method: string;
  url: string;
  headers: { upgrade?: string | string[] };
};

export function isWebSocketUpgradeRequest(request: UpgradeRequest): boolean {
  const upgrade = Array.isArray(request.headers.upgrade)
    ? request.headers.upgrade[0]
    : request.headers.upgrade;
  return request.method === "GET" &&
    request.url.split("?", 1)[0] === "/ws" &&
    upgrade?.toLowerCase() === "websocket";
}
