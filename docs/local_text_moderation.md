# Local text moderation model and policy

This decision was recorded before model installation.

## Selected model

- **Model:** Unitary `multilingual-toxic-xlm-roberta` (Detoxify multilingual XLM-R base)
- **Upstream:** <https://huggingface.co/unitary/multilingual-toxic-xlm-roberta>
- **Upstream revision:** `4ad6f5c104d9ce813a1a2f33cac0c5b579ef6ee5`
- **CPU artifact:** dynamic-quantized ONNX conversion
  <https://huggingface.co/hoan/multilingual-toxic-xlm-roberta-dynamic-quantized>
- **Artifact revision:** `87059f2f26f113930e3c840b4bf7d5de0a4a1944`
- **License:** Apache-2.0 for the upstream model and conversion; ONNX Runtime is MIT and
  SentencePiece is Apache-2.0. These licenses permit commercial use. Exact notices and links are
  also in `moderation-worker/MODEL_LICENSES.md`.
- **Artifact size:** approximately 279 MB for the quantized ONNX weights plus approximately 5 MB
  for the SentencePiece model. Exact installed sizes and SHA-256 values are printed and verified by
  the controlled installer.
- **Runtime:** Python 3, `onnxruntime` CPU execution provider, `sentencepiece`; no hosted inference,
  HTTP listener, arbitrary URL fetch, filesystem path input, or shell input.
- **Architecture:** XLM-R base, 12 layers, hidden size 768, max 512 tokens. Amoria truncates message
  inference to 256 SentencePiece tokens because chat messages are short and latency is important.
- **Concurrency:** one long-lived worker process and one in-flight inference by default. The Node
  client has a bounded queue and timeout; it does not spawn per-message inference processes.

## Supported output used by Amoria

The checkpoint emits Detoxify multilingual heads. Amoria records and uses only genuine classifier
outputs: `toxicity`, `severe_toxicity`, `identity_attack`, `insult`, and `threat`. The model does not
provide scam, phishing, coercion, or spam verdicts. Identity-demographic heads are ignored.
`sexual_explicit` is also ignored by product policy so ordinary consensual adult dating/flirting is
not prohibited merely for sexual vocabulary.

Separate local deterministic rules combine small, normalized EN/RU/HR phrase groups. They cover
spam plus request-and-context signals for credential/OTP theft, phishing, financial scam pressure,
blackmail/coercion, sexual coercion, and threatened disclosure of private data. A lone word such as
`code`, `код`, `kod`, `password`, `address`, or `adresa` is not a violation. URL handling is string
analysis only: the service never opens or fetches a URL. Findings use machine-readable categories
in existing moderation evidence and flow through the existing held/needs-review/restricted states.
This bounded policy is not represented as a universal AI scam detector.

The model card says training/evaluation covered English, French, Spanish, Italian, Portuguese,
Turkish, and Russian. English and Russian are supported target languages. Croatian is **not an
upstream validated language**; Croatian scores therefore require cautious interpretation and no
equal-quality claim. Controlled Croatian QA is required and must be reported honestly.

## Known limitations

- Toxicity models can over-score profanity, quoted abuse, humor, reclaimed terms, and identity
  mentions. The model is not an intent detector.
- The ML model is not a scam/phishing, coercion, grooming, consent, or unwanted-solicitation
  classifier. Deterministic coverage is intentionally limited to the documented combinations.
- A single score never bans or deletes an account.
- The model never makes an automatic `removed` decision. High confidence may hold/restrict only the
  message; ambiguous flags are added to the Admin queue without suppressing normal delivery.
- Croatian quality is not claimed to equal English or Russian.

## Product policy separation

`TextModerationPolicy` remains versioned as `amoria_text_policy_v1` and consumes only genuine model
signals. Deterministic findings use the separate `amoria_deterministic_text_safety_v1` policy. The
existing message-safety pipeline merges model, deterministic, and anti-spam outcomes. Evidence is
preserved in append-only review metadata with engine, policy version, selected signals, decision,
duration where applicable, and timestamp.

Low-risk messages can fail soft if the worker is unavailable, while the abuse guard still runs and
the history records `automationStatus=failed`. Messages with deterministic high-risk signals fail
closed to `held`/`needs_review`. There is no `catch => safe` claim.

## Installation and storage

Weights are never committed. The controlled command installs to
`F:\Dev\Amoria-Models\text-moderation-v1` by default:

```powershell
npm run text-moderation:install
```

Production config points `TEXT_MODERATION_MODEL_DIR` at that external directory and uses the local
Python configured by `TEXT_MODERATION_PYTHON`. Runtime inference never sends message text to a third
party.
