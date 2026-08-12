import assert from "node:assert/strict";
import net, { type Server, type Socket } from "node:net";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://unused";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.AUTH_SECURITY_HMAC_SECRET = "test-auth-security-secret-that-is-long-enough";

type CapturedMessage = {
  from: string;
  recipients: string[];
  raw: string;
};

type LocalSmtpOptions = {
  rejectRecipientCode?: 451 | 550;
  rejectAuthentication?: boolean;
  stallGreeting?: boolean;
};

class LocalSmtpServer {
  readonly messages: CapturedMessage[] = [];
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private portValue = 0;

  constructor(private readonly options: LocalSmtpOptions = {}) {
    this.server = net.createServer((socket) => this.accept(socket));
  }

  get port(): number {
    return this.portValue;
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.server.off("error", reject);
        const address = this.server.address();
        if (!address || typeof address === "string") return reject(new Error("SMTP port unavailable"));
        this.portValue = address.port;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => error ? reject(error) : resolve());
    });
  }

  private accept(socket: Socket): void {
    this.sockets.add(socket);
    socket.setEncoding("utf8");
    socket.on("close", () => this.sockets.delete(socket));
    socket.on("error", () => undefined);
    if (this.options.stallGreeting) return;

    let buffer = "";
    let dataMode = false;
    let dataLines: string[] = [];
    let sender = "";
    let recipients: string[] = [];
    socket.write("220 localhost ESMTP Amoria test server\r\n");

    const respond = (line: string) => socket.write(`${line}\r\n`);
    const command = (line: string) => {
      if (dataMode) {
        if (line === ".") {
          this.messages.push({ from: sender, recipients: [...recipients], raw: dataLines.join("\r\n") });
          dataMode = false;
          dataLines = [];
          respond("250 2.0.0 queued");
          return;
        }
        dataLines.push(line.startsWith("..") ? line.slice(1) : line);
        return;
      }

      const upper = line.toUpperCase();
      if (upper.startsWith("EHLO ") || upper.startsWith("HELO ")) {
        socket.write("250-localhost\r\n");
        if (this.options.rejectAuthentication) socket.write("250-AUTH PLAIN LOGIN\r\n");
        socket.write("250 SIZE 1048576\r\n");
      } else if (upper.startsWith("AUTH ")) {
        respond(this.options.rejectAuthentication
          ? "535 5.7.8 Authentication credentials invalid"
          : "235 2.7.0 authenticated");
      } else if (upper.startsWith("STARTTLS")) {
        respond("454 4.7.0 TLS unavailable");
      } else if (upper.startsWith("MAIL FROM:")) {
        sender = line.slice("MAIL FROM:".length).trim().replace(/^<|>.*$/g, "");
        recipients = [];
        respond("250 2.1.0 sender accepted");
      } else if (upper.startsWith("RCPT TO:")) {
        if (this.options.rejectRecipientCode) {
          respond(`${this.options.rejectRecipientCode} ${this.options.rejectRecipientCode === 451 ? "4.2.0 temporary failure" : "5.1.1 recipient rejected"}`);
        } else {
          recipients.push(line.slice("RCPT TO:".length).trim().replace(/^<|>.*$/g, ""));
          respond("250 2.1.5 recipient accepted");
        }
      } else if (upper === "DATA") {
        dataMode = true;
        respond("354 End data with <CR><LF>.<CR><LF>");
      } else if (upper === "RSET" || upper === "NOOP") {
        respond("250 2.0.0 ok");
      } else if (upper === "QUIT") {
        respond("221 2.0.0 bye");
        socket.end();
      } else {
        respond("502 5.5.1 command not implemented");
      }
    };

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const boundary = buffer.indexOf("\r\n");
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        command(line);
      }
    });
  }
}

const baseConfig = (port: number) => ({
  host: "127.0.0.1",
  port,
  secure: false,
  requireTls: false,
  timeoutMs: 500,
  mailFrom: "no-reply@example.test",
  mailFromName: "Amoria",
});

test("verification and reset messages traverse a real SMTP conversation with complete headers and bodies", async (t) => {
  const server = new LocalSmtpServer();
  await server.start();
  t.after(() => server.stop());
  const { SmtpEmailDelivery } = require("../src/email/email-delivery.service") as typeof import("../src/email/email-delivery.service");
  const { renderAuthEmail } = require("../src/email/email-templates") as typeof import("../src/email/email-templates");
  const delivery = new SmtpEmailDelivery(baseConfig(server.port));

  await delivery.verify();
  await delivery.send("recipient@example.test", renderAuthEmail({
    purpose: "verify_email",
    locale: "en",
    code: "123456",
    expiresInMinutes: 15,
  }));
  await delivery.send("recipient@example.test", renderAuthEmail({
    purpose: "password_reset",
    locale: "en",
    code: "654321",
    expiresInMinutes: 15,
  }));

  assert.equal(server.messages.length, 2);
  assert.deepEqual(server.messages.map((message) => message.from), [
    "no-reply@example.test",
    "no-reply@example.test",
  ]);
  assert.deepEqual(server.messages.map((message) => message.recipients), [
    ["recipient@example.test"],
    ["recipient@example.test"],
  ]);
  for (const message of server.messages) {
    assert.match(message.raw, /^From: Amoria <no-reply@example\.test>$/mi);
    assert.match(message.raw, /^To: recipient@example\.test$/mi);
    assert.match(message.raw, /^Date: .+$/mi);
    assert.match(message.raw, /^Message-ID: <.+>$/mi);
    assert.match(message.raw, /Content-Type: multipart\/alternative/i);
    assert.match(message.raw, /Content-Type: text\/plain/i);
    assert.match(message.raw, /Content-Type: text\/html/i);
  }
  assert.match(server.messages[0].raw, /^Subject: Verify your Amoria email$/mi);
  assert.match(server.messages[0].raw, /123456/);
  assert.match(server.messages[1].raw, /^Subject: Reset your Amoria password$/mi);
  assert.match(server.messages[1].raw, /654321/);
  assert.doesNotMatch(server.messages.map((message) => message.raw).join("\n"), /accessToken|refreshToken|passwordHash/i);
});

test("temporary and permanent SMTP recipient rejection remain distinct application failures", async () => {
  const { EmailDeliveryError, SmtpEmailDelivery } = require("../src/email/email-delivery.service") as typeof import("../src/email/email-delivery.service");
  const message = { subject: "Test", text: "text", html: "<p>html</p>" };

  for (const [responseCode, expectedKind, expectedCode] of [
    [451, "transient", "smtp_temporary_rejection"],
    [550, "permanent", "smtp_recipient_rejected"],
  ] as const) {
    const server = new LocalSmtpServer({ rejectRecipientCode: responseCode });
    await server.start();
    try {
      const delivery = new SmtpEmailDelivery(baseConfig(server.port));
      await assert.rejects(() => delivery.send("recipient@example.test", message), (error) => {
        assert.equal(error instanceof EmailDeliveryError, true);
        assert.equal((error as InstanceType<typeof EmailDeliveryError>).kind, expectedKind);
        assert.equal((error as InstanceType<typeof EmailDeliveryError>).safeCode, expectedCode);
        assert.doesNotMatch(String(error), /127\.0\.0\.1|recipient@example\.test/);
        return true;
      });
      assert.equal(server.messages.length, 0);
    } finally {
      await server.stop();
    }
  }
});

test("connection failure and greeting timeout fail within the configured bound", async () => {
  const { EmailDeliveryError, SmtpEmailDelivery } = require("../src/email/email-delivery.service") as typeof import("../src/email/email-delivery.service");
  const reservation = net.createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address();
  assert.ok(address && typeof address !== "string");
  const closedPort = address.port;
  await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));

  const message = { subject: "Test", text: "text", html: "<p>html</p>" };
  const refused = new SmtpEmailDelivery({ ...baseConfig(closedPort), timeoutMs: 150 });
  await assert.rejects(() => refused.send("recipient@example.test", message), (error) => {
    assert.equal(error instanceof EmailDeliveryError, true);
    assert.equal((error as InstanceType<typeof EmailDeliveryError>).kind, "transient");
    return true;
  });

  const stalled = new LocalSmtpServer({ stallGreeting: true });
  await stalled.start();
  const startedAt = Date.now();
  try {
    const timed = new SmtpEmailDelivery({ ...baseConfig(stalled.port), timeoutMs: 150 });
    await assert.rejects(() => timed.send("recipient@example.test", message), (error) => {
      assert.equal(error instanceof EmailDeliveryError, true);
      assert.equal((error as InstanceType<typeof EmailDeliveryError>).safeCode, "smtp_timeout");
      return true;
    });
    assert.ok(Date.now() - startedAt < 2_000);
  } finally {
    await stalled.stop();
  }
});

test("SMTP authentication failure is permanent and exposes no credentials", async (t) => {
  const server = new LocalSmtpServer({ rejectAuthentication: true });
  await server.start();
  t.after(() => server.stop());
  const { EmailDeliveryError, SmtpEmailDelivery } = require("../src/email/email-delivery.service") as typeof import("../src/email/email-delivery.service");
  const delivery = new SmtpEmailDelivery({
    ...baseConfig(server.port),
    username: "smtp-user",
    password: "smtp-password-secret",
  });

  await assert.rejects(() => delivery.verify(), (error) => {
    assert.equal(error instanceof EmailDeliveryError, true);
    assert.equal((error as InstanceType<typeof EmailDeliveryError>).kind, "permanent");
    assert.equal((error as InstanceType<typeof EmailDeliveryError>).safeCode, "smtp_authentication_failed");
    assert.doesNotMatch(String(error), /smtp-user|smtp-password-secret/);
    return true;
  });
});

test("SMTP_REQUIRE_TLS never downgrades to plaintext delivery", async (t) => {
  const server = new LocalSmtpServer();
  await server.start();
  t.after(() => server.stop());
  const { EmailDeliveryError, SmtpEmailDelivery } = require("../src/email/email-delivery.service") as typeof import("../src/email/email-delivery.service");
  const delivery = new SmtpEmailDelivery({ ...baseConfig(server.port), requireTls: true });

  await assert.rejects(
    () => delivery.send("recipient@example.test", { subject: "Test", text: "text", html: "<p>html</p>" }),
    (error) => {
      assert.equal(error instanceof EmailDeliveryError, true);
      assert.equal((error as InstanceType<typeof EmailDeliveryError>).kind, "permanent");
      assert.equal((error as InstanceType<typeof EmailDeliveryError>).safeCode, "smtp_tls_failed");
      return true;
    },
  );
  assert.equal(server.messages.length, 0);
});

test("header injection is rejected before SMTP and delivery failures do not log message secrets", async (t) => {
  const server = new LocalSmtpServer({ rejectRecipientCode: 550 });
  await server.start();
  t.after(() => server.stop());
  const { EmailDeliveryError, SmtpEmailDelivery } = require("../src/email/email-delivery.service") as typeof import("../src/email/email-delivery.service");
  const delivery = new SmtpEmailDelivery(baseConfig(server.port));
  const observed: string[] = [];
  const originalError = console.error;
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.error = (...values) => observed.push(values.join(" "));
  console.log = (...values) => observed.push(values.join(" "));
  console.warn = (...values) => observed.push(values.join(" "));
  try {
    await assert.rejects(
      () => delivery.send("recipient@example.test\r\nBcc: injected@example.test", {
        subject: "Verify",
        text: "sensitive-code-246810",
        html: "<p>sensitive-code-246810</p>",
      }),
      (error) => error instanceof EmailDeliveryError && error.safeCode === "smtp_message_invalid",
    );
    await assert.rejects(() => delivery.send("recipient@example.test", {
      subject: "Verify",
      text: "sensitive-code-246810",
      html: "<p>sensitive-code-246810</p>",
    }));
  } finally {
    console.error = originalError;
    console.log = originalLog;
    console.warn = originalWarn;
  }
  assert.doesNotMatch(observed.join("\n"), /sensitive-code-246810|smtp-password/i);
  assert.equal(server.messages.length, 0);
});
