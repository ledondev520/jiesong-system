# Nestlet one-shot synthetic streaming proof

Prepared October 7, 2026. This is local preparation, not live-provider acceptance.

## Exact scope

- Run only as operation `stream-proof` on the dedicated maintenance branch and the existing `nestlet-stage` concurrency group
- Running image and current pointer must both identify `4d4c15315d80b5fb7e9f8c2f3f883b10c1121c40`; existing service must be healthy and root filesystem read-only
- Existing in-container `DEEPSEEK_API_KEY`, enabled live AI and the app's Flash-only model contract are used internally; no environment file, settings route, session, DB, case or original-file reads
- Reject unexpected runtime mounts; open `/app` and its public `chat.js` with no-follow flags. Require a regular single-link, non-executable, non-group/world-writable file owned by the image user and exactly 12,143 bytes before reading. Verify the reviewed SHA-256 and unchanged metadata, then import only those verified public bytes and use the pure `parseProviderStream` export. The pinned 4d module has no imports or application-start side effects. The 533 candidate adds library imports and is deliberately not accepted by this proof
- One fixed non-sensitive synthetic text prompt to the existing official `https://api.deepseek.com/chat/completions` endpoint, `deepseek-flash`, `stream:true`, thinking disabled and maximum 16 output tokens. No new provider endpoint, tool call, image, document, arbitrary prompt, SDK retry or fallback
- Bound the entire provider request and body to 20 seconds, 65,536 incoming bytes and 128 output characters. The app's parser requires actual SSE content, a `stop` finish reason and `[DONE]`; missing/truncated/error streams fail
- Only `stream-completed` or `provider-unconfirmed` is returned. Model text, key/config values, upstream bodies and request identifiers are never logged or saved

The existing maintenance lease is held. A new root-owned exclusive 0600 attempt marker is fsynced in the existing private shared directory before the call. It is never removed or reset. An uncertain or failed attempt must not be repeated automatically. The completed mail proof and its marker are untouched. No service, deployment, DB, environment, account or persistent access change is part of this proof.

## Local evidence

Commands run from this maintenance worktree:

- `NESTLET_PROOF_PUBLIC_CHAT_SOURCE=/path/to/public/4d/chat.js python3 scripts/test-nestlet-stream-proof.py`: 8 test groups passed, including the actual pinned public parser against synthetic mocked streams, fragmented UTF-8, normal completion, missing terminators, truncation, provider errors, malformed SSE, response type/size limits, disabled/missing/unsupported configuration, parser failure, no-follow and bounded source-file loading, unexpected mounts, non-root-safe ownership simulation, header/body deadlines, cancellation and no retries
- `python3 scripts/test-nestlet-mail-proof.py`: 6 tests passed; prior mail behavior unchanged
- `python3 scripts/test-nestlet-upgrade-schema5.py`: 14 tests passed; additive operation only
- `python3 scripts/test-nestlet-verify-archive.py`: 21 tests passed
- `python3 scripts/test-nestlet-release-identity.py`: 11 tests passed after adding the new fixed operation to its expected dispatch allowlist
- Workflow YAML was parsed and the actual dispatch shell passed `bash -n`
- Local ByteRover lookup and curation were unavailable because its CLI is not installed; no software was installed

No live provider request, SSH, Docker action, credential inspection, deployment, publication or dispatch was performed in these tests. Independent review and root authorization are required before publication and the single dispatch.

## Interpretation

A live `stream-completed` establishes only that the already-configured provider can return a complete real text stream at this moment. It does not establish frontend streaming, extraction quality, image support, saved-library retrieval, customer-data privacy, email authentication or overall MVP acceptance. Failure remains provider-unconfirmed, with no automatic diagnostic expansion or retry.

## Public protocol reference

Checked October 7, 2026: [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) documents the Flash model, streaming format, thinking toggle, and bounded `max_tokens`. Existing pinned Nestlet `chat.js` and `server.js` are authoritative for this app's selected endpoint and provider configuration contract.
