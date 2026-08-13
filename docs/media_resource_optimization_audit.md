# Media/resource optimization audit

## Scope

This audit covers the server/backend and admin web media paths on branch
`backend/standalone-foundation` at `241ec35c553cb7f4b8201670f09d5242fb6c0ba5`,
reviewed on 2026-07-12. It covers upload limits, image processing, S3-compatible
object storage, public and locked delivery, admin moderation previews, and the
relevant automated tests.

This is a release audit, not a destructive compression pass. It does not change
upload limits, image quality, DTOs, storage keys, locked-gallery authorization,
or existing media. The only code hardening included with the audit is a
`private, no-store` response header on the existing authenticated admin media
content route.

## Current release-safe behavior

- Fastify JSON requests are limited to 1 MB. Multipart registration is limited
  to one file and 10 MB, while the avatar route applies its narrower 8 MB limit.
- Prepared uploads validate purpose, declared MIME type, positive size up to 10
  MB, expiry, ownership, stored object size, and stored `Content-Type` before
  completion. A supplied checksum is required to match the prepared checksum.
- Accepted image declarations are limited to JPEG, PNG, and WebP. Avatar and
  profile-photo processing also decodes the actual bytes with Sharp, verifies
  the decoded format and dimensions (256 through 8000 pixels per side), and
  rejects corrupt, unsupported, and multi-page/animated images.
- Sharp limits decoded input to 8000 x 8000 pixels and uses `failOn: "warning"`.
  EXIF orientation is applied with `rotate()` before cropping. Outputs are new
  WebP buffers without `withMetadata()`, so source metadata is not intentionally
  copied. This metadata behavior should still have a regression test.
- Avatars are center- or client-cropped, resized to 512 x 512, and encoded as
  WebP at quality 82. Profile photos are square-cropped and encoded as WebP at
  quality 86. Both paths generate backend-owned UUID object keys and checksums.
- Direct multipart profile-photo upload and prepared profile-photo completion
  both run through the same decode/crop/WebP sanitization path. The raw prepared
  profile object is deleted after the sanitized object is stored.
- Public media URLs use opaque media IDs (`/media/public/:mediaId`), not object
  keys or signed storage URLs. The route only serves avatar/profile-avatar and
  publicly visible profile-gallery media. Public responses use
  `public, max-age=31536000, immutable`; UUID-based object replacement makes the
  immutable policy appropriate for current avatar/profile objects.
- Locked profile media requires authentication, a scoped unlock token, locked
  gallery visibility, and the existing block policy. It returns
  `private, no-store`; the public route returns 404 for locked gallery items.
- Admin media list/detail/content routes require admin authentication. Locked
  detail and content require owner/moderator role, a reason, and an audit entry.
  Locked list/detail DTOs do not expose a public URL. Admin content now returns
  `private, no-store` for every moderation blob.
- Object reads are bounded by a byte-counting reader. Storage failures are
  translated to stable application errors, and the health response reduces
  failures to safe codes without returning endpoint credentials, bucket names,
  object keys, or signed URLs.
- Existing tests cover avatar transformation and size rejection; JPEG, PNG, and
  WebP profile processing; corrupt, unsupported, small, and oversized inputs; public versus
  locked delivery and cache headers; prepared upload ownership/size/MIME state;
  object-storage health redaction; gallery authorization; and audited admin
  locked-media access.

## Risks before production

### Large processed profile photos

`processProfilePhotoImage` crops and re-encodes but does not resize profile
photos. An accepted 8000 x 8000 image can therefore consume substantial Sharp
CPU/memory and remain a large WebP (up to the 10 MB processed limit). Public and
admin routes then buffer the complete object in application memory on every
cache miss. There is no thumbnail or display-sized variant.

### No processing boundary for generic signed-upload purposes

Prepared `announcement_photo` and `together_asset` uploads validate the declared
size and object `Content-Type`, but completion does not download/decode the bytes,
verify magic bytes, recompute a supplied checksum, reject animation, strip
metadata, or generate a safe variant. The current `/media/public/:mediaId` route
does not serve these types, so this is not currently a public-image bypass, but
the generic completion record must not be treated as sanitized media by a future
consumer.

### Storage privacy is partly deployment configuration

The application never adds a public ACL and serves protected objects through
authorized backend routes. However, code cannot prove the deployed bucket
policy, anonymous access setting, CDN origin policy, or lifecycle rules.
Backend-generated media references remain stable application routes. With
`PUBLIC_MEDIA_DELIVERY_MODE=presigned`, only an approved public route response is
redirected through `S3_PUBLIC_BASE_URL` using a short-lived signature. Production
must verify that raw object keys and prepared upload objects are not anonymously
readable and that the public endpoint fronts the private bucket API.

### Legacy static upload tree remains mounted

Fastify mounts `UPLOADS_ROOT` at `/media/`, while current avatar/profile writes
use object storage. `local-storage.ts` is still present and can write a stable
`users/:id/avatar.webp` path, although the current upload service does not call
it. The production uploads directory must be inventoried before deployment so a
private legacy file cannot be exposed by the static mount. Do not delete that
directory as part of this audit.

### Full-buffer delivery and admin previews

In scale-out `presigned` mode, approved public reads bypass Node after the
moderation/visibility check. Low-cost `proxy` mode, locked reads, and admin reads
still download the object into a Buffer. The 10 MB cap prevents unbounded single
reads, but concurrent locked/admin reads can amplify application memory and
storage egress. Admin web requests a full moderation blob and creates a browser
object URL; there is no thumbnail, range response, or lightweight preview.

### Cache and metadata coverage gaps

- Public and locked cache behavior is tested. The new admin `private, no-store`
  assertion closes the previously missing sensitive-preview cache coverage.
- There is no regression test proving that GPS/EXIF metadata is absent from
  processed avatar/profile outputs.
- There is no focused multi-page JPEG/WebP fixture proving the animated-image
  rejection branch, although the implementation rejects `metadata.pages > 1`.
- There is no test that generic signed uploads contain real bytes matching their
  declared JPEG/PNG/WebP MIME type, because generic completion does not perform
  that validation.
- Cache behavior for legacy files served by `@fastify/static` is not specified
  in application configuration.

## Must-fix before release

For an internal or tightly controlled smoke environment, no existing-media
migration is required. Before open production traffic, these items are release
blockers:

1. Verify and record the production bucket/CDN policy: anonymous reads must be
   disabled for raw keys and prepared uploads, and only application public media
   routes may expose public gallery content.
2. Bound worst-case image-processing load. Choose and test a production policy
   for maximum processed profile dimensions plus upload rate/concurrency limits.
   The present 8000 x 8000 synchronous processing ceiling is too expensive to
   accept without capacity evidence or an upstream control.
3. Inventory `UPLOADS_ROOT` before enabling the static `/media/` mount in
   production. Confirm it contains public legacy assets only, or disable/move
   the mount through a separately tested migration plan.
4. Do not activate announcement/together media rendering from generic completed
   uploads until those purposes have byte-level decode/validation and a defined
   access policy.

## Should-fix soon after release

- Generate bounded display and thumbnail variants for profile photos while
  retaining the existing original policy only if product requirements need it.
- Stream or proxy object bodies instead of buffering full media in the Node.js
  process, while preserving byte limits and authorization.
- Give admin moderation a thumbnail/preview variant and fetch the full blob only
  on explicit inspection.
- Add regression fixtures containing EXIF/GPS metadata and assert that processed
  WebP output contains none.
- Recompute checksums from object bytes for generic signed uploads rather than
  comparing two client-provided values.
- Add lifecycle handling for expired/abandoned prepared-upload objects after a
  retention decision and operational metrics are in place.
- Add media metrics for input/output bytes, Sharp duration/failures, storage
  latency, cache hit ratio at the proxy/CDN, and admin full-preview frequency.
- Define explicit cache headers for any retained legacy static public files.

## Safe implementation plan

1. **Low-risk controls and tests:** verify production bucket/static-root policy;
   add upload rate/concurrency controls; retain the new admin no-store header;
   add EXIF stripping, static cache, and generic MIME-byte tests; add metrics
   without logging keys, URLs, tokens, or credentials.
2. **Thumbnail and display variants:** define product-approved dimensions and
   quality, generate new UUID-addressed WebP variants for new uploads, expose
   them without changing private authorization, and make clients prefer the
   appropriate size. Roll out behind measured tests rather than overwriting an
   existing object.
3. **Background cleanup/reprocessing:** only after backup, idempotency, rollback,
   retention, and user-impact decisions, create variants for existing media in
   a rate-limited background job. Keep old objects until references and QA are
   verified; never recompress in place.
4. **CDN/object-storage hardening:** use a private origin, explicit CDN cache
   keys and TTLs for public UUID media, no-store/bypass rules for locked/admin
   routes, lifecycle rules for abandoned raw uploads, access logs, and secret
   rotation. Validate with real deployment probes.

## Manual QA checklist

- [ ] Upload avatar JPEG; verify crop, 512 x 512 WebP result, and display.
- [ ] Upload avatar PNG and WebP; verify the same normalized output.
- [ ] Upload profile photo JPEG, PNG, and WebP through the active mobile path;
      verify crop, gallery membership, and public display.
- [ ] Reject avatar over 8 MB and profile/prepared media over 10 MB.
- [ ] Reject unsupported MIME declarations, corrupt image bytes, an animated
      image, and dimensions below 256 or above 8000.
- [ ] Verify a public gallery photo loads through `/media/public/:mediaId` with
      immutable public caching.
- [ ] Move a photo to locked; verify the public route returns no media and the
      locked route requires the correct account/token and uses no-store.
- [ ] Verify wrong/expired locked-gallery tokens and blocked viewers reveal no
      bytes or private URL.
- [ ] Open public and locked media in admin moderation; verify role/reason/audit,
      correct preview, and `Cache-Control: private, no-store`.
- [ ] Probe a missing/bad public media URL and verify the client fallback/error
      does not leak an object key or signed URL.
- [ ] Verify object-storage health failures expose only safe status/error codes.
- [ ] Verify Android dev build avatar, public profile photos, locked unlock, and
      authenticated locked image rendering on a real device.
- [ ] Confirm raw S3 object keys and prepared-upload keys are not anonymously
      readable in the production-like environment.

## Do not do yet

- Do not delete existing user media or abandoned objects without an approved
  retention policy and a dry-run inventory.
- Do not recompress or replace existing user media in place.
- Do not change current quality or dimension limits without product and capacity
  decisions plus regression testing.
- Do not make locked photos paid or connect locked-gallery access to
  monetization.
- Do not expose signed URLs, bucket paths, object keys, or storage credentials in
  public/mobile DTOs, logs, health output, or diagnostics.
- Do not add media variants by silently changing the current public/mobile DTO
  shape.
