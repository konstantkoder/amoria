# Local public-photo moderation

Amoria's API stores sanitized media in a private S3-compatible bucket and records public intent in
PostgreSQL before queuing work. The separate Python worker accepts no HTTP traffic or caller paths.
It claims a durable media ID, resolves the trusted object key from the database, and rechecks that
the current item is an avatar or a public gallery photo both before object access and when applying
the result.

## Model and runtime

- Model: Yahoo OpenNSFW ResNet-50 1-by-2, packaged by `opennsfw-onnx` 0.1.0.
- Upstream model: <https://github.com/yahoo/open_nsfw>
- ONNX package: <https://github.com/gawryco/opennsfw-onnx/tree/v0.1.0>
- Execution provider: ONNX Runtime 1.28.0, CPU only.
- Model input: decoded image resized by the package to 224 by 224 pixels.
- Output: SFW and NSFW probabilities.
- Weight size: 23,590,724 bytes.
- Weight SHA-256: `864bb37bf8863564b87eb330ab8c785a79a773f4e7c43cb96db52ed8611305fa`.
- Model/runtime license: Yahoo model BSD-2-Clause; `opennsfw-onnx` wrapper Apache-2.0; ONNX Runtime
  MIT. Review upstream notices before redistribution.
- Person presence: YOLOX-Nano's person class combined with YuNet face-presence confidence, both
  executed locally through ONNX Runtime. The output is only `true`, `false`, or `unknown`; no boxes,
  landmarks, face embeddings, identity matching, or identity attributes are stored. A missing or
  failed detector returns `unknown`. For new avatars only, `false` and `unknown` prevent automatic
  adoption and require human review; ordinary public gallery policy remains based on NSFW score.
  Violence remains unsupported and is stored as `unknown`.
- Person-model combined weight size: 3,891,996 bytes. Checksums and upstream licenses are recorded
  in `moderation-worker/MODEL_LICENSES.md` and enforced by the installer and worker.

The weights are not committed. On Windows, run:

```powershell
npm run moderation:install
```

This creates a pinned virtual environment and person-model cache outside media storage (defaults
`F:\Dev\Amoria-Models\opennsfw-onnx-0.1.0` and
`F:\Dev\Amoria-Models\person-presence-v1`) and verifies every model checksum. Set
`MODERATION_PYTHON`, `OPENNSFW_ONNX_MODEL_PATH`, `PERSON_YOLOX_ONNX_MODEL_PATH`, and
`PERSON_YUNET_ONNX_MODEL_PATH` for another controlled installation.

## Operations and failure behavior

Run `npm run moderation:worker`. Default concurrency is one and validated maximum concurrency is
two. Reads are bounded by byte count, decoded dimensions, S3 timeouts, and a hard inference timeout.
Inference runs in a child process that can be terminated. Jobs use exponential backoff and three
attempts by default. Expired running leases are recovered on startup. Exhausted jobs become failed
and their media becomes `needs_review` with origin `automation_failed`; no failure path approves.

Logs contain job/media IDs, state, timing, and model version—not image bytes, object paths, tokens,
passwords, or secrets.

## Media state and exposure

- New avatar/public photo: `pending`, private, one durable job.
- Policy approve: `approved`, public API access permitted. A new avatar is approved automatically
  only when person presence is `true`; `false`/`unknown` remain review-gated.
- Uncertain: `needs_review`, public API access denied.
- Policy restrict: `restricted`, public API access denied.
- Logical remove: `removed`, references cleared and public API access denied; review history and the
  private object remain for audit/appeal.
- Existing pre-migration media: deliberately backfilled `approved` with origin
  `legacy_pre_moderation`; no model result is invented.

When a new avatar is pending, the approved current avatar stays active. Adoption occurs only on
approval; the superseded avatar is then logically removed while its private object and history are
retained. A reasoned owner/moderator approval of a detector false-negative records an explicit
`manualPersonPresenceOverride` in the separate review and audit metadata; automated scores and raw
results are preserved.

## Locked-gallery structural boundary

New locked uploads are created as `needs_review` / `awaiting_manual_locked` and the same transaction
does not enqueue a job. A public-to-locked transition immediately denies public access and cancels
any active automatic job without erasing completed history. A locked-to-public transition atomically
sets `pending` and creates a job. Claim and completion transactions recheck current visibility, so a
race cannot make a locked object readable by the worker.

Locked list/detail DTOs omit readable URLs and paths. Actual content requires owner/moderator role,
an explicit reason, and an audit record; a locked decision additionally requires recent content
access by that same admin.

## Diagnostics and bounded bulk foundation

`npm run media:diagnostics -- --limit=1000` reports bounded sets of missing objects, hashed object
keys without database rows, unusable gallery rows, and unavailable avatar references. It never
deletes. The moderation service accepts explicit, bounded media ID lists (maximum 100), supports
dry-run, and filters eligibility in SQL; it is not a country-wide or unbounded scanner.
