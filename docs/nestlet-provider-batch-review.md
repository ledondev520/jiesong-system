# Approved three-request synthetic provider batch

Prepared October 7, 2026. Owner approval covers at most three small DeepSeek requests for text, image and streaming, using synthetic material only. This is local preparation and test evidence, not a completed live provider check. Root owns publication and dispatch after confirming the exact live release. The existing unknown-stage one-shot marker is never read, reset or reused.

## Fixed scope and execution budget

- Application pin: `0ad91847e8c04f379f071e76bf8c325f9bb12233`; maintenance base: `e78b6f29ccb3b7bd911d3116673b1c4dca6713ed`
- One fixed approval-scoped batch: `20261007-e875a213224b`, with exactly the ordered kinds text, image and stream; no caller-supplied prompts, modes or batch identifier
- Text: one synthetic 2 + 3 challenge, checked against a single-digit answer
- Image: one authored 96×96 white image containing a centered red square; 212-byte PNG, no metadata, visually inspected and pixel/CRC verified. The question asks for its color without naming the answer
- Stream: one fixed synthetic prompt, checked using the app's exact SSE parser and a short expected answer
- Same official `https://api.deepseek.com/chat/completions` endpoint and `deepseek-flash` model. Thinking disabled; each request has a maximum 16 output tokens, 20-second full-response deadline, 65,536-byte response bound and 128-character content cap
- Image bytes are inline; no Files API upload, external image URL, model-list request, extra probe, retry or fallback

An exclusive host-private 0700 batch directory refuses every repeat dispatch, even when the prior attempt ended early. A provider-free source/configuration preflight runs first. Its fixed class is saved privately; only a ready preflight can proceed. Each of the three fixed cases requires an exclusive 0600 request reservation, fsynced together with its directory before the single provider exec. Its fixed terminal class is then fsynced. A lost result or changed local precondition stops the batch; unused slots are not resumed automatically. Other completed-but-unconfirmed cases can proceed to the next distinct approved kind without retrying the failed kind. The total can never exceed three in this batch.

A reservation means the request was allowed to start, not that the provider received packets. A crash or missing terminal outcome remains unknown and never authorizes a repeat. The script prints only text/image/stream completed or unconfirmed labels. Keys, configuration values, generated answers, raw provider responses and request identifiers are never returned or persisted. No app account, customer case, image from a user, database, volume or runtime configuration is changed.

## Runtime/source gate

The existing maintenance lease is held throughout the batch. Exact current pointer, image identity, healthy state, read-only root and runtime user are required. Only the existing dedicated /data volume and optional /tmp tmpfs are allowed, so application code cannot be overmounted. Root dispatch must use the existing `nestlet-stage` workflow concurrency and must wait for deployment completion. This patch does not edit any workflow.

Canonical 0664/0775 source metadata is accepted only behind those immutable/no-overlay gates and trusted UID/GID checks. Public files remain no-follow, regular, single-link, exact-sized, owner-readable and free of special/world-write/executable bits. Metadata and hashes are verified without changing permissions. Merged 0ad chat.js is byte-identical to the reviewed 533 source: 27,778 bytes, SHA-256 `78609005543130da939c20b066818b785adbb5dd031a7195ee82859ac2c19b9c`. Only its separately hashed static helpers and pure SSE parser byte ranges are imported; no server/auth/storage/library modules run.

## Current official multimodal contract

Checked October 7, 2026: the [DeepSeek Vision guide](https://api-docs.deepseek.com/guides/vision/) states that `deepseek-flash` supports PNG input through base64 `image_url` blocks in user messages. `detail: low` is supported. The [Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/) documents this content-part shape, streaming, thinking control and maximum-output parameter. This check uses that current model name and contract, not a retired vision-model alias. Documentation support does not establish availability for this specific account; only the separately authorized request can test it.

## Offline evidence and remaining gate

`NESTLET_PROOF_PUBLIC_CHAT_SOURCE=/path/to/merged/0ad/chat.js python3 scripts/test-nestlet-provider-batch.py` passes eight synthetic test groups covering fixed three-call scope, repeated-batch refusal, fsynced receipts, preflight/receipt failure before requests, lost outcomes stopping without retry, exact runtime pin and immutable/no-overlay guards, PNG byte/pixel/CRC validation, canonical metadata, parser hashes, all three request bodies, response types, token/byte/content limits, wrong answers and bounded header/body failures. Python syntax compilation and diff whitespace checks also pass.

No production provider call, host action, deployment, publication or dispatch was performed by this preparation. Live results would establish only these narrow synthetic transport/content checks; they are not UI, extraction, saved-library retrieval, production-data privacy or full MVP acceptance.
