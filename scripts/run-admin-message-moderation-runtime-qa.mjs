import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";

process.env.NODE_ENV = "development";
process.env.TEXT_MODERATION_ENABLED = "false";

const [{ buildApp }, { signAccessToken }, { pool, closeDb }] = await Promise.all([
  import("../src/app.ts"),
  import("../src/auth/jwt.ts"),
  import("../src/db/client.ts"),
]);

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browserDataDir = await mkdtemp(path.join(tmpdir(), "amoria-admin-runtime-qa-"));
let app;
let preview;
let edge;
let cdp;

const result = {
  renderer: "Microsoft Edge Chromium via DevTools Protocol",
  apiRuntime: false,
  adminWebRuntime: false,
  messageModerationNavigation: false,
  queueFiltersRendered: false,
  reportedRowsRendered: false,
  detailRendered: false,
  historyRendered: false,
  approveThroughUi: false,
  restrictThroughUi: false,
  removeThroughUi: false,
  privateReadAuditWritten: false,
  persistentScreenshot: false,
};

try {
  const owner = (await pool.query(
    `SELECT u.id FROM admin_users au
      JOIN users u ON u.id=au.user_id
      JOIN admin_user_roles aur ON aur.admin_user_id=au.id
      JOIN admin_roles ar ON ar.id=aur.role_id
      WHERE au.status='active' AND ar.key='owner' LIMIT 1`,
  )).rows[0];
  assert.ok(owner?.id, "An active local QA owner is required");
  const token = signAccessToken(owner.id);
  const auditBefore = Number((await pool.query(
    `SELECT count(*) count FROM admin_audit_log WHERE action='admin.messageModeration.privateMessage.read'`,
  )).rows[0].count);

  app = buildApp();
  await app.listen({ host: "127.0.0.1", port: 4000 });
  result.apiRuntime = true;

  const viteCli = path.resolve("admin-web", "node_modules", "vite", "bin", "vite.js");
  preview = spawn(process.execPath, [viteCli, "preview", "--host", "127.0.0.1", "--port", "4174"], {
    cwd: path.resolve("admin-web"),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let previewDiagnostic = "";
  preview.stdout.on("data", (chunk) => { previewDiagnostic = `${previewDiagnostic}${chunk}`.slice(-1_000); });
  preview.stderr.on("data", (chunk) => { previewDiagnostic = `${previewDiagnostic}${chunk}`.slice(-1_000); });
  const previewExit = new Promise((_, reject) => {
    preview.once("error", reject);
    preview.once("exit", (code) => reject(new Error(`admin_preview_exit_${code}: ${previewDiagnostic}`)));
  });
  await Promise.race([waitForHttp("http://127.0.0.1:4174", 30_000), previewExit]);

  edge = spawn(edgePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=9223",
    `--user-data-dir=${browserDataDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore"], windowsHide: true });
  await waitForHttp("http://127.0.0.1:9223/json/version", 20_000);
  const devtoolsVersion = await (await fetch("http://127.0.0.1:9223/json/version")).json();
  assert.ok(devtoolsVersion.webSocketDebuggerUrl);
  cdp = await createCdp(devtoolsVersion.webSocketDebuggerUrl);
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.navigate", { url: "http://127.0.0.1:4174" }, sessionId);
  await delay(600);
  await evaluate(cdp, sessionId, `localStorage.setItem("amoria.admin.tokens", ${JSON.stringify(JSON.stringify({
    accessToken: token,
    refreshToken: "runtime-qa-unused",
    accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
  }))})`);
  await cdp.send("Page.reload", { ignoreCache: true }, sessionId);
  await waitForExpression(cdp, sessionId, `document.body.innerText.includes("Message Moderation")`, 15_000);
  result.adminWebRuntime = true;

  assert.equal(await evaluate(cdp, sessionId, `(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === "Message Moderation");
    if (!button) return false;
    button.click();
    return true;
  })()`), true);
  await waitForExpression(cdp, sessionId, `Boolean(document.querySelector(".grid-two"))`, 10_000);
  result.messageModerationNavigation = true;
  result.queueFiltersRendered = await evaluate(cdp, sessionId, `document.querySelectorAll(".grid-two .filters select").length >= 2`);

  assert.equal(await evaluate(cdp, sessionId, `(() => {
    const panel = document.querySelector(".grid-two > .panel");
    const form = panel?.querySelector("form.filters");
    const select = form?.querySelector("select");
    if (!form || !select) return false;
    select.value = "reported";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    form.requestSubmit();
    return true;
  })()`), true);
  await waitForExpression(cdp, sessionId, `document.querySelectorAll(".grid-two > .panel tbody tr").length > 0`, 10_000);
  result.reportedRowsRendered = true;

  assert.equal(await evaluate(cdp, sessionId, `(() => {
    const row = document.querySelector(".grid-two > .panel tbody tr");
    if (!row) return false;
    row.click();
    return true;
  })()`), true);
  await waitForExpression(cdp, sessionId, `document.body.innerText.includes("Selected message body")`, 10_000);
  const detailBodyLength = await evaluate(cdp, sessionId, `document.querySelector(".detail-json")?.textContent.length || 0`);
  assert.ok(detailBodyLength > 0);
  result.detailRendered = true;
  result.historyRendered = await evaluate(cdp, sessionId, `document.body.innerText.includes("Moderation history")`);

  await submitUiDecision(cdp, sessionId, "approve", "Runtime QA approve");
  result.approveThroughUi = true;
  await submitUiDecision(cdp, sessionId, "restrict", "Runtime QA restrict");
  result.restrictThroughUi = true;
  await submitUiDecision(cdp, sessionId, "remove", "Runtime QA remove");
  result.removeThroughUi = true;

  const auditAfter = Number((await pool.query(
    `SELECT count(*) count FROM admin_audit_log WHERE action='admin.messageModeration.privateMessage.read'`,
  )).rows[0].count);
  assert.ok(auditAfter > auditBefore);
  result.privateReadAuditWritten = true;
} finally {
  try { await cdp?.send("Browser.close"); } catch {}
  await delay(300);
  try { cdp?.close(); } catch {}
  try { edge?.kill(); } catch {}
  try { preview?.kill(); } catch {}
  if (app) await app.close().catch(() => undefined);
  await closeDb().catch(() => undefined);
  const resolvedTemp = path.resolve(browserDataDir);
  if (resolvedTemp.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(resolvedTemp).startsWith("amoria-admin-runtime-qa-")) {
    await rm(resolvedTemp, { recursive: true, force: true }).catch(() => undefined);
  }
}

process.stdout.write(`ADMIN_MESSAGE_MODERATION_RUNTIME_RESULT=${JSON.stringify(result)}\n`);

async function submitUiDecision(client, sessionId, action, reason) {
  const submitted = await evaluate(client, sessionId, `(() => {
    const panels = document.querySelectorAll(".grid-two > .panel");
    const form = panels[1]?.querySelector("form.stack-form");
    const select = form?.querySelector("select");
    const input = form?.querySelector("input");
    if (!form || !select || !input) return false;
    select.value = ${JSON.stringify(action)};
    select.dispatchEvent(new Event("change", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(reason)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    form.requestSubmit();
    return true;
  })()`);
  assert.equal(submitted, true);
  await delay(1_000);
  await waitForExpression(client, sessionId, `Boolean(document.querySelector(".grid-two > .panel:nth-child(2) form.stack-form"))`, 10_000);
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error("admin_preview_timeout");
}

async function createCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  let nextId = 1;
  const pending = new Map();
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const deferred = pending.get(message.id);
    if (!deferred) return;
    pending.delete(message.id);
    message.error ? deferred.reject(new Error(message.error.message)) : deferred.resolve(message.result);
  });
  return {
    send(method, params = {}, sessionId) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    close() { socket.close(); },
  };
}

async function evaluate(client, sessionId, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId);
  if (response.exceptionDetails) throw new Error("browser_evaluation_failed");
  return response.result.value;
}

async function waitForExpression(client, sessionId, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, sessionId, expression)) return;
    await delay(200);
  }
  throw new Error(`browser_condition_timeout: ${expression}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
