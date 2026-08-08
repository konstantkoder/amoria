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

Limits and challenge timings are configurable through the variables documented in `.env.example`. Security records are retained for seven days by default and cleaned during auth traffic. SMTP uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, optional username/password, and `MAIL_FROM`; production startup fails if the dedicated HMAC secret or required SMTP sender configuration is missing.
