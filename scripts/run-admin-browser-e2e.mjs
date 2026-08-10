import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const adminUrl = process.env.ADMIN_WEB_QA_URL || "http://127.0.0.1:4174";
const edgePath = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const outputDir = process.argv[2];
const password = process.env.AMORIA_ADMIN_QA_PASSWORD?.trim();
const debuggingPort = 9223;
const results = {
  startedAt: new Date().toISOString(),
  assertions: [],
  consoleErrors: [],
  failedResponses: [],
  screenshots: [],
};

assert(outputDir, "Usage: node scripts/run-admin-browser-e2e.mjs <output-directory>");
assert(password, "AMORIA_ADMIN_QA_PASSWORD is required");
await mkdir(outputDir, { recursive: true });
const profileDir = await mkdtemp(join(tmpdir(), "amoria-admin-edge-"));
const edge = spawn(edgePath, [
  "--headless=new",
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profileDir}`,
  "--window-size=1440,1000",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank",
], { stdio: "ignore", windowsHide: true });

let cdp;
try {
  await waitFor(
    () => fetch(`http://127.0.0.1:${debuggingPort}/json/version`).then((response) => response.ok).catch(() => false),
    15_000,
  );
  const targetResponse = await fetch(
    `http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent(adminUrl)}`,
    { method: "PUT" },
  );
  assert.equal(targetResponse.ok, true, "Edge DevTools target creation failed");
  const target = await targetResponse.json();
  cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  cdp.on("Runtime.exceptionThrown", (event) => {
    results.consoleErrors.push(event.exceptionDetails?.text || "Runtime exception");
  });
  cdp.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") {
      results.consoleErrors.push(event.args?.map((arg) => arg.value ?? arg.description).join(" ") || "console.error");
    }
  });
  cdp.on("Network.responseReceived", (event) => {
    if (event.response.status >= 400) {
      const url = new URL(event.response.url);
      results.failedResponses.push({ status: event.response.status, path: url.pathname });
    }
  });
  await cdp.send("Page.navigate", { url: adminUrl });
  await waitForEval(() => Boolean(document.querySelector("form.login-form")));

  await login("qa-owner-control@amoria.local");
  const ownerNav = await navLabels();
  assert.equal(ownerNav.length, 16);
  for (const label of ["Admin Users", "Bulk Moderation", "Audit Log", "Bootstrap"]) assert(ownerNav.includes(label));
  record("owner navigation exposes all 16 authorized screens");
  assert.equal(await openAllPermittedScreens(ownerNav), 16);
  record("owner opened every permitted release screen in real runtime", "16 screens");

  await clickNav("Bulk Moderation");
  await waitForText("Safe bulk moderation");
  assert.equal(await evaluate(() => Array.from(document.querySelectorAll("option")).some((option) => option.textContent?.includes("Physical media purge"))), true);
  record("owner bulk screen exposes bounded physical purge workflow");
  await screenshot("admin-bulk-owner.png");
  await evaluate(() => {
    const form = document.querySelector("section.grid-two > .panel:first-child form.stack-form");
    const textarea = form.querySelector("textarea");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(textarea, "QA browser dry-run preview");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    form.querySelector("button").click();
  });
  await waitForText("Dry-run preview is ready.");
  record("owner created a bounded non-destructive bulk preview through the UI");

  await setLanguage("ru");
  const russianTitle = await evaluate(() => document.querySelector(".topbar h1")?.textContent || "");
  assert(russianTitle && russianTitle !== "Bulk Moderation" && /[^\u0000-\u007f]/.test(russianTitle));
  await setLanguage("hr");
  assert.equal(await evaluate(() => document.querySelector(".topbar h1")?.textContent), "Skupno moderiranje");
  await setLanguage("en");
  record("EN, RU, and HR switch in-place without reload errors");

  await clickNav("Nearby Activities");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const nearbyNavigationState = await evaluate(() => ({
    title: document.querySelector(".topbar h1")?.textContent?.trim(),
    active: document.querySelector("aside nav button.active")?.textContent?.trim(),
  }));
  assert.equal(
    nearbyNavigationState.title,
    "Nearby Activities",
    `Nearby navigation did not activate: ${JSON.stringify(nearbyNavigationState)}`,
  );
  await waitForEval(
    (title) => document.querySelector(".topbar h1")?.textContent?.trim() === title,
    15_000,
    "Nearby Activities",
  );
  await waitForEval(() => document.querySelectorAll("img.nearby-demand-thumbnail").length > 0, 15_000).catch(async () => {
    const diagnostic = await evaluate(() => ({
      imageCount: document.querySelectorAll("img").length,
      text: document.querySelector("main.workspace")?.innerText?.slice(0, 800),
    }));
    throw new Error(`Nearby artwork did not render: ${JSON.stringify(diagnostic)}`);
  });
  await evaluate(() => {
    for (const image of document.querySelectorAll("img.nearby-demand-thumbnail")) image.loading = "eager";
  });
  const art = await evaluate(async () => {
    const images = Array.from(document.querySelectorAll("img.nearby-demand-thumbnail"));
    const urls = [...new Set(images.map((image) => image.src))];
    const sourceUrls = [...new Set([...urls, new URL("/activity-art/default.jpg", location.origin).href])];
    const responses = await Promise.all(sourceUrls.map((url) => fetch(url)));
    return {
      count: images.length,
      uniqueCatalogAssets: urls.length,
      sourceAssetCount: sourceUrls.length,
      allAssetsOk: responses.every((response) => response.ok),
    };
  });
  assert(art.count >= 19);
  assert.equal(art.sourceAssetCount, 19);
  assert.equal(art.allAssetsOk, true);
  record("historical V5 activity artwork renders for the release catalog", `${art.count} thumbnails / ${art.uniqueCatalogAssets} catalog assets + fallback`);
  await screenshot("nearby-v5-owner.png");

  await clickNav("Reports");
  await waitForActiveTitle("Reports");
  await evaluate(() => document.querySelector("section.grid-two > .panel form.filters button").click());
  await waitForEval(() => Boolean(document.querySelector("section.grid-two > .panel tbody tr") && document.querySelector("form.stack-form")), 15_000);
  await evaluate(() => {
    const form = document.querySelector("form.stack-form");
    const select = form.querySelector("select");
    const textarea = form.querySelector("textarea");
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, "add_note");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(textarea, "QA browser workflow note");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    form.requestSubmit();
  });
  await waitForText("Report ");
  await waitForEval(() => document.querySelector(".notice")?.textContent?.includes("updated") === true, 15_000);
  record("owner added a report review note through the UI");

  await clickNav("Message Moderation");
  await waitForActiveTitle("Message Moderation");
  await waitForEval(() => Boolean(document.querySelector("section.grid-two > .panel tbody tr")), 15_000);
  await evaluate(() => document.querySelector("section.grid-two > .panel tbody tr").click());
  await waitForEval(() => Boolean(document.querySelector("pre.detail-json")), 15_000);
  record("owner opened one flagged/reported QA message through the reasoned UI flow");

  await clickNav("Media Moderation");
  await waitForActiveTitle("Media Moderation");
  await evaluate(() => {
    const form = document.querySelector("section.grid-two > .panel form.filters");
    const selects = form.querySelectorAll("select");
    const inputs = form.querySelectorAll("input");
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(selects[0], "locked");
    selects[0].dispatchEvent(new Event("change", { bubbles: true }));
    const reasonInput = inputs[inputs.length - 1];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(reasonInput, "QA browser locked-media review");
    reasonInput.dispatchEvent(new Event("input", { bubbles: true }));
    form.querySelector("button").click();
  });
  await waitForEval(() => Boolean(document.querySelector("section.grid-two > .panel tbody tr")), 15_000);
  await evaluate(() => document.querySelector("section.grid-two > .panel tbody tr").click());
  await waitForEval(() => Boolean(document.querySelector(".media-preview-frame .media-preview")), 15_000);
  record("owner opened one locked QA image through the reason-gated UI flow");

  await logout();
  await login("qa-moderator-control@amoria.local");
  const moderatorNav = await navLabels();
  assert(moderatorNav.includes("Bulk Moderation"));
  assert(!moderatorNav.includes("Admin Users") && !moderatorNav.includes("Audit Log"));
  assert.equal(await openAllPermittedScreens(moderatorNav), moderatorNav.length);
  record("moderator opened every permitted screen in real runtime", `${moderatorNav.length} screens`);
  await clickNav("Bulk Moderation");
  await waitForText("Safe bulk moderation");
  assert.equal(await evaluate(() => Array.from(document.querySelectorAll("option")).some((option) => option.textContent?.includes("Physical media purge"))), false);
  record("moderator sees moderation tools but not owner-only administration or physical purge");

  await logout();
  await login("qa-support-control@amoria.local");
  const supportNav = await navLabels();
  for (const label of ["Users", "Reports", "Media Moderation", "Client Errors", "Ops Health"]) assert(supportNav.includes(label));
  assert(!supportNav.includes("Bulk Moderation") && !supportNav.includes("Admin Users"));
  assert.equal(await openAllPermittedScreens(supportNav), supportNav.length);
  record("support navigation is read/support scoped");
  record("support opened every permitted screen in real runtime", `${supportNav.length} screens`);
  await clickNav("Dashboard");
  await waitForActiveTitle("Dashboard");
  await screenshot("admin-support-role.png");

  await logout();
  await login("qa-ops-control@amoria.local");
  const opsNav = await navLabels();
  for (const label of ["Together Queue", "Together Sessions", "Nearby Diagnostics", "Ops Health"]) assert(opsNav.includes(label));
  assert(!opsNav.includes("Users") && !opsNav.includes("Reports") && !opsNav.includes("Bulk Moderation"));
  assert.equal(await openAllPermittedScreens(opsNav), opsNav.length);
  record("ops navigation is diagnostics and lifecycle scoped");
  record("ops opened every permitted screen in real runtime", `${opsNav.length} screens`);

  assert.deepEqual(results.consoleErrors, []);
  assert.deepEqual(results.failedResponses, []);
  results.pass = true;
} catch (error) {
  results.pass = false;
  results.failure = {
    name: error?.name || "Error",
    message: String(error?.message || error),
    stack: String(error?.stack || "").split("\n").slice(0, 8),
  };
  process.exitCode = 1;
} finally {
  results.completedAt = new Date().toISOString();
  if (cdp) await cdp.send("Browser.close").catch(() => undefined);
  cdp?.close();
  edge.kill();
  await waitFor(
    () => fetch(`http://127.0.0.1:${debuggingPort}/json/version`).then(() => false).catch(() => true),
    5_000,
  ).catch(() => undefined);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(profileDir, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await writeFile(join(outputDir, "admin-browser-e2e-results.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

function record(name, detail = "pass") {
  results.assertions.push({ name, detail });
}

async function login(email) {
  await waitForEval(() => Boolean(document.querySelector("form.login-form")));
  await evaluate(({ email, password }) => {
    const setValue = (selector, value) => {
      const input = document.querySelector(selector);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setValue('input[type="email"]', email);
    setValue('input[type="password"]', password);
    document.querySelector("form.login-form button").click();
  }, { email, password });
  await waitForEval(() => Boolean(document.querySelector("aside.sidebar nav")), 15_000);
}

async function logout() {
  await evaluate(() => document.querySelector(".topbar-actions button.secondary").click());
  await waitForEval(() => Boolean(document.querySelector("form.login-form")), 15_000);
}

async function navLabels() {
  return evaluate(() => Array.from(document.querySelectorAll("aside nav button"), (button) => button.textContent.trim()));
}

async function clickNav(label) {
  const clicked = await evaluate((label) => {
    const button = Array.from(document.querySelectorAll("aside nav button")).find((item) => item.textContent.trim() === label);
    button?.click();
    return Boolean(button);
  }, label);
  assert.equal(clicked, true, `Missing navigation item: ${label}`);
}

async function waitForActiveTitle(title) {
  await waitForEval(
    (expected) => document.querySelector(".topbar h1")?.textContent?.trim() === expected,
    15_000,
    title,
  );
}

async function openAllPermittedScreens(labels) {
  for (const label of labels) {
    await clickNav(label);
    await waitForActiveTitle(label);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const error = await evaluate(() => document.querySelector("main.workspace .error")?.textContent?.trim() || "");
    assert.equal(error, "", `${label} rendered an error state: ${error}`);
  }
  return labels.length;
}

async function setLanguage(language) {
  await evaluate((language) => {
    const select = document.querySelector("select");
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(select, language);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, language);
  await waitForEval((language) => document.querySelector("select")?.value === language, 10_000, language);
}

async function waitForText(text) {
  await waitForEval((text) => document.body.innerText.includes(text), 15_000, text);
}

async function screenshot(name) {
  const response = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(join(outputDir, name), Buffer.from(response.data, "base64"));
  results.screenshots.push(name);
}

async function evaluate(fn, argument) {
  const expression = `(${fn.toString()})(${argument === undefined ? "" : JSON.stringify(argument)})`;
  const response = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

async function waitForEval(predicate, timeout = 10_000, argument) {
  await waitFor(() => evaluate(predicate, argument).catch(() => false), timeout);
}

async function waitFor(predicate, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out after ${timeout}ms`);
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry?.reject(new Error(message.error.message));
      else entry?.resolve(message.result);
      return;
    }
    for (const listener of listeners.get(message.method) || []) listener(message.params);
  });
  return {
    send(method, params = {}) {
      const id = ++nextId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    on(method, listener) {
      listeners.set(method, [...(listeners.get(method) || []), listener]);
    },
    close() {
      socket.close();
    },
  };
}
