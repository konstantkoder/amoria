# Admin production security

This runbook describes the non-secret controls required before Admin can be used in production. It does not authorize deployment and contains no production credentials or network addresses.

## Release gate

Admin must remain unreachable until every item below is configured and verified:

- HTTPS terminates at an approved reverse proxy; HTTP is redirected or rejected.
- `ADMIN_NETWORK_ACCESS_MODE=private_cidr` and `ADMIN_ALLOWED_CIDRS` contains only the exact VPN/private gateway source CIDRs. Do not use `0.0.0.0/0`, `::/0`, public CIDRs, or client-provided forwarding headers as an allowlist.
- The Admin Web and Admin API are reachable only through the VPN/private subnet. There must be no unrestricted public Admin route.
- `CORS_ALLOWED_ORIGINS` contains the exact HTTPS Admin Web origin, without wildcards, `null`, lookalike domains, or extra origins.
- `TRUST_PROXY` identifies only the known reverse proxy address/CIDR or the smallest verified hop count. Never trust every proxy.
- `ADMIN_MFA_ENCRYPTION_KEY` is an independently generated 32-byte random value encoded as base64/base64url or 64-character hex. Generate it with a cryptographic RNG, for example `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`, and move it immediately to the production secret store. Do not reuse JWT, database, HMAC, or storage secrets.
- The Admin Web reverse proxy preserves the source address according to the verified `TRUST_PROXY` topology, applies HTTPS/HSTS, and does not weaken the application's CSP, frame protection, or `nosniff` headers.
- `ADMIN_WEB_HOST` remains loopback unless a container must listen on all interfaces. A production `0.0.0.0`/`::` bind requires the explicit `ADMIN_WEB_ALLOW_ALL_INTERFACES=true` acknowledgement and an outer loopback/private reverse-proxy boundary.

Production configuration defaults Admin network access to `disabled`. This intentionally blocks Admin session and Admin API routes while leaving the normal Mobile API available. `development_local` is forbidden in production. A malformed/missing CIDR fails startup or denies the request; do not work around that failure.

## Authentication and MFA operations

MFA is mandatory for owner, moderator, support, and ops. A password validates only the first stage and never creates an Admin access or refresh session. Each Admin enrolls a local RFC 6238 TOTP authenticator and stores the one-time recovery-code set offline, separately from the password and authenticator device.

The TOTP secret is encrypted at rest with AES-256-GCM. Recovery codes are stored only as keyed hashes and each can be consumed once. Successful TOTP counters, pre-auth challenges, refresh tokens, and recovery codes are replay-protected. Do not log, ticket, email, screenshot, or persist the TOTP secret, `otpauth` URI, one-time code, recovery code, session token, or cookie.

Recent MFA step-up is required for Admin creation, role/status changes, MFA reset, and destructive bulk confirmation including physical purge. The production default step-up TTL is controlled by `ADMIN_STEP_UP_TTL_SEC` (600 seconds in the example). A failed or expired step-up must not be bypassed.

Role removal, Admin disable, user suspension/password revocation, refresh replay, and MFA reset revoke effective Admin access. Monitor these security events and repeated password, TOTP, recovery-code, and step-up failures. Never add a master code, production test credential, or HTTP “disable MFA” path.

## Audit and monitoring

Collect the append-only Admin audit stream and alert on at least:

- Admin creation, role/status changes, user suspension/restoration, MFA reset, and destructive confirmation;
- MFA enrollment, success/failure aggregates, recovery-code use/regeneration, session replay, and step-up activity;
- a zero-owner or unexpectedly low active-owner count;
- repeated denied Origin/header/network-gate requests and rate-limit lockouts.

Retain `requestId`, trusted source IP, and bounded user-agent context. Audit metadata must never contain passwords, TOTP secrets/codes, recovery codes, authorization tokens, cookies, encryption keys, or raw pre-auth/step-up tokens. There is no Admin API for modifying or deleting audit events.

## Backup, restore, and migration

Before migration or release, take an encrypted PostgreSQL backup and test restore in an isolated environment. Protect backups as authentication material because encrypted MFA records and security history are present. Keep the MFA encryption key in the secret backup system separately from the database backup, with access control and recovery testing.

Migration `0039_admin_mfa_security.sql` is forward-only because this repository has no down-migration framework. Apply it using the migration role before starting the new application. Verify all Admin MFA/session tables, constraints, and indexes. Application rollback may retain the additive schema, but the earlier application must not be exposed as Admin because it cannot enforce the new mandatory MFA flow. Do not drop the new tables/columns as an emergency rollback. Restore the pre-migration database backup only during an approved outage after preserving security/audit evidence and confirming data-loss implications.

After restore, verify the active owner count, Admin session revocation state, audit continuity, encryption-key availability, and a complete synthetic MFA login/recovery/step-up test before allowing owner access.

## Lost phone and recovery codes

First use one unused offline recovery code, sign in, perform step-up, regenerate the set, and replace the offline backup. Regeneration invalidates every older recovery code.

If an active owner has lost both the authenticator and all recovery codes, use the offline CLI from an authenticated server shell. There is deliberately no web bypass:

1. Take/verify a database backup and record the incident/operator approval.
2. Use the migration database URL through the secured shell; never paste it into chat or a ticket.
3. Identify exactly one active owner by Admin UUID or email and provide a meaningful 10–500 character reason.
4. Run one of:

   ```text
   npm run admin:reset-owner-mfa -- --admin-user-id <ADMIN_UUID> --reason "<incident reason>" --confirm-reset-mfa
   npm run admin:reset-owner-mfa -- --email <OWNER_EMAIL> --reason "<incident reason>" --confirm-reset-mfa
   ```

5. Confirm the `admin.mfa.emergency_reset` audit event. The procedure deletes the old MFA credential and recovery hashes, revokes Admin/pre-auth/step-up sessions, increments the Admin session version, and forces enrollment on the next password login. It never reveals the old secret.
6. Have the owner enroll a new authenticator through the normal private Admin path and store the newly generated recovery codes offline. Review all audit activity since the last known-good owner access.

Restrict CLI execution and migration credentials to designated operators. Never run the CLI from a browser host or make it reachable over HTTP.

## Pre-opening checklist

- Restore test and `0039` fresh/upgrade migration tests passed on isolated PostgreSQL.
- Server typecheck, full tests, real PostgreSQL Admin attack suite, Admin Web build/tests, and dependency audits passed for the release SHA.
- VPN/private CIDRs, reverse proxy, HTTPS, exact Origin, and strict proxy trust were independently reviewed.
- Every real Admin completed MFA; owners verified offline recovery-code backups.
- Owner-count, audit, rate-limit, revocation, and network-denial monitoring is active.
- A synthetic walkthrough confirms password stage, enrollment, TOTP/recovery, refresh rotation, step-up, logout, revocation, and destructive confirmation without leaking secrets.
