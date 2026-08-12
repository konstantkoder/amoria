# Authentication email and abuse controls

New registrations create an unverified user and deliver a six-digit code through standard SMTP. Registration never returns access or refresh tokens. Existing users are grandfathered by migration `0029`: `email_verified_at` is set to their original `created_at`; the column has no default, so subsequent users start unverified.

Codes live for 15 minutes by default, allow five attempts, and are stored only as keyed HMAC-SHA-256 digests. Creating a new active challenge consumes the previous one. Verification, reset confirmation, password replacement, and refresh-token revocation use row locks and transactions.

The local disposable-domain list is `src/email/disposable-domains.txt`. `DISPOSABLE_EMAIL_DOMAIN_OVERRIDES` can add comma-separated domains without changing auth logic. Registration validates MX records first and falls back to A/AAAA routing; permanent DNS negatives reject the address while transient DNS failures return a retryable service error.

PostgreSQL rate-limit records contain only keyed identity hashes and expire automatically. Release defaults are:

| Flow | Email | IP | Device | Window / block |
| --- | ---: | ---: | ---: | --- |
| Register | 3 | 10 | 5 | 1 hour |
| Login failures | 5 | 20 | 10 | 15 minutes |
| Verification attempts | 10 | 30 | 20 | 15 minutes |
| Verification resend | 5 | 20 | 10 | 1 hour, plus 60-second message cooldown |
| Reset request | 3 | 20 | 10 | 1 hour |
| Reset confirmation | 10 | 30 | 20 | 15 minutes |

Limits and challenge timings are configurable through the variables documented in `.env.example`. Security records are retained for seven days by default and cleaned during auth traffic.

## Application email logic: done

Registration, verification resend, and password reset create a challenge before delivery. A
successful SMTP transaction is required before the challenge is marked sent. SMTP failure consumes
only the newly failed challenge, does not verify the user, and does not issue an access or refresh
token; a subsequent resend can create a replacement challenge. The client receives only a stable
generic error. SMTP response text, host, username, password, message body, and code are not included
in client errors or ordinary application logs.

## SMTP transport: done

Nodemailer uses standard SMTP and supports `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
`SMTP_REQUIRE_TLS`, optional `SMTP_USER`/`SMTP_PASSWORD`, `SMTP_CONNECTION_TIMEOUT_MS`,
`MAIL_FROM`, and `MAIL_FROM_NAME`. Username and password must either both be set or both be blank;
blank credentials are intended only for a relay isolated inside a private network. Sender address
and display name are controlled configuration and reject line breaks. Connection, greeting, and
socket timeouts share the configured bound, which must be between 100 and 30,000 milliseconds.

Temporary SMTP/network failures map to a generic retryable service error. Authentication, TLS,
recipient, and permanent SMTP rejection failures map to a separate generic delivery failure.
Nodemailer must report the configured recipient as accepted; otherwise the request fails. No
provider-specific or paid hosted email API is used.

`GET /health/ready` runs bounded `transporter.verify()` without sending a message and reports
`dependencies.smtp` as `ok` or `error`. SMTP failure makes the response explicitly `degraded` but
does not by itself mark the API/database/object-storage core unready. Liveness does not depend on
SMTP, and verification is not performed on every application request.

Outgoing verification and reset messages include controlled From, To, and Subject headers plus
plain-text and HTML alternatives. Nodemailer/MTA generates Date and Message-ID. Only the necessary
one-time code appears in the body; passwords and session credentials do not.

## Production mail server and DNS: external infrastructure step

The application is ready to connect over SMTP to a separate self-hosted MTA or private relay. The
repository does not guess or deploy an MTA image. Real internet delivery still requires the
production operator to provision and validate a mail hostname, MTA, SPF, DKIM, DMARC, PTR/reverse
DNS, outbound SMTP connectivity, relay restrictions, and delivery to external mailbox providers.
Local protocol integration tests do not claim that production internet deliverability has passed.
