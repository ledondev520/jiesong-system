# Agent CLI + MCP-Ready Architecture Design

## Context

The current system already has:

- A working web application for human operators
- A backend API layer with JWT authentication
- Role-based authorization on write routes
- Audit logging on most business mutations
- Several domain APIs that already support search/list/create/update flows

The missing piece is not "web automation." The missing piece is a stable machine-facing command layer that can be used by:

- local shell agents
- VPS-local automations
- remote agents such as OpenClaw, Feishu/OpenClaw bridges, or future AI assistants

The final system of record remains this system's backend and database. External agents do not own data. They only read from and write to this system through controlled interfaces.

## Goals

1. Add a machine-facing interface that supports:
   - query data
   - create data
   - update data
2. Start with a first-class CLI
3. Design the CLI so the same business capabilities can later be exposed as MCP tools
4. Introduce independent Agent accounts / Service Accounts instead of reusing employee identities
5. Preserve security, auditability, and business validation

## Non-Goals

1. Do not make agents drive the browser UI as the primary integration model
2. Do not let CLI or MCP bypass backend validation rules
3. Do not collapse agent identity into existing employee users
4. Do not expose unrestricted full-access tokens in v1

## Recommended Architecture

The system should be split into five layers:

### 1. Source of Truth Layer

The current backend API and database remain the only source of truth.

- Web UI writes here
- CLI writes here
- MCP writes here
- Audit logs are generated here

### 2. Command Layer

Add a machine-oriented application layer that maps business tasks into stable actions. This is the core abstraction that both CLI and MCP will use.

Examples:

- `search_entities`
- `get_purchase`
- `create_purchase_with_items`
- `upsert_supplier`
- `track_product`
- `batch_match_hscode`
- `update_purchase_status`

This layer should not format output for humans. It should return structured results and typed errors.

### 3. SDK Layer

Add a reusable client SDK that handles:

- login / token exchange
- agent token loading
- HTTP transport
- retries and timeouts
- structured error normalization
- idempotency headers

Both CLI and MCP server should use the same SDK or the same command abstractions.

### 4. CLI Layer

Add a `jiesong` CLI for:

- local operators
- shell agents
- automation scripts
- debugging command contracts before MCP

The CLI should support:

- human-readable output by default
- `--json` for machine usage
- stable exit codes

### 5. MCP Layer

Do not build MCP first. Build it after the command layer and CLI are stable.

The MCP server should expose high-value business tools backed by the same command layer. It should not reimplement business logic.

Target shape:

- `MCP tool -> command layer -> backend`

or, if needed temporarily:

- `MCP tool -> CLI --json`

The first option is preferred.

## Identity Model

### Decision

Use independent Agent accounts / Service Accounts.

### Why

- clear audit trails
- isolated credentials
- easier revocation
- no employee impersonation
- natural fit for remote agents and MCP

### New Entities

Add the following domain objects:

#### AgentAccount

Represents a machine identity.

Suggested fields:

- `id`
- `name`
- `slug`
- `description`
- `status` (`ACTIVE`, `DISABLED`)
- `defaultMode` (`READ_ONLY`, `READ_INGEST`, `CUSTOM`)
- `createdAt`
- `updatedAt`

#### AgentCredential

Represents a token or secret issued to an Agent account.

Suggested fields:

- `id`
- `agentAccountId`
- `label`
- `secretHash`
- `secretPreview`
- `status`
- `expiresAt`
- `lastUsedAt`
- `createdAt`
- `revokedAt`

Store only hashes, never raw secrets.

#### AgentGrant

Represents capability grants for each agent.

Suggested fields:

- `id`
- `agentAccountId`
- `resource`
- `action`
- `scopeJson`
- `createdAt`

This keeps authorization explicit and extensible.

## Authorization Model

### Initial Default

Per user instruction, first-version default capability is:

- read
- ingest/create

No update/delete by default.

### Capability Shape

Use resource-action grants, for example:

- `search.read`
- `product.read`
- `supplier.read`
- `supplier.create`
- `purchase.read`
- `purchase.create`
- `hs_code.read`
- `hs_code.match`
- `dashboard.track_product`

Future capabilities:

- `purchase.update`
- `sales.update`
- `inventory.update`
- `finance.write`
- `system.admin`

### Important Rule

Agent permissions must not be inferred from user roles. They need their own explicit grant model.

### Implementation Status Note (2026-04-04)

The current repository implementation has not yet landed an explicit per-agent grant editor.

What is in code today:

- Agent accounts are still independent machine identities
- Agent authorization is still capability-based at request time
- But account creation/update currently auto-assigns a fixed capability set instead of letting admins configure grants per agent

Current fixed capability set in code:

- `search.read`
- `purchase.create`
- `purchase.update`
- `supplier.create`
- `supplier.update`

So this document's "explicit grant model + default read/create only" remains the intended target architecture, not the exact current shipped behavior.

## Authentication Model

### Human Users

Keep existing JWT login flow.

### Agent Accounts

Add agent token authentication.

Recommended request format:

- `Authorization: Bearer jsa_<token>`

Recommended flow:

1. Agent account is created by admin
2. Credential is issued once
3. Raw secret is shown once and never stored in plaintext
4. Backend hashes and verifies the secret
5. Backend resolves the agent account and grants

### Why Not Reuse JWT User Login

- remote agent secrets should be revocable independently
- no human password sharing
- cleaner audit semantics

## Audit Model

The current `OperationLog` is user-only. That is insufficient for service accounts.

### Required Change

Extend audit data to support both human and agent actors.

Recommended fields:

- `actorType` (`USER`, `AGENT`)
- `userId?`
- `agentAccountId?`
- `credentialId?`
- `requestId`
- `idempotencyKey?`
- `action`
- `entity`
- `entityId`
- `oldValue`
- `newValue`
- `ipAddress`
- `userAgent`
- `createdAt`

### Goal

Every machine mutation should answer:

- which agent did this
- with which credential
- from which request
- what changed

## Command Layer Design

### Design Rule

Expose task-level commands, not raw table-level commands only.

Bad:

- `db.insert.purchase_contract`

Good:

- `create_purchase_with_items`
- `parse_quote_and_prepare_purchase`
- `upsert_supplier`
- `search_entities`

### Initial Command Set

#### Query

- `search_entities`
- `get_product`
- `list_products`
- `get_supplier`
- `list_suppliers`
- `get_purchase`
- `list_purchases`
- `track_product`
- `search_hs_codes`
- `batch_match_hscode`

#### Ingest / Create

- `create_supplier`
- `upsert_supplier`
- `create_product`
- `create_purchase_with_items`
- `parse_quote`
- `parse_quote_and_prepare_purchase`

#### Future Update

- `update_supplier`
- `update_product`
- `update_purchase`
- `update_purchase_status`

Update actions are designed now but not granted by default to v1 agents.

## CLI Design

### Principles

1. Human-readable by default
2. Structured with `--json`
3. Stable exit codes
4. No secrets in shell history
5. No business logic duplication inside CLI

### Proposed Commands

```bash
jiesong auth login
jiesong auth agent-login
jiesong auth whoami

jiesong search "瓷砖" --types product,supplier,purchase --json

jiesong supplier create --name "佛山A厂" --contact-name "张三" --phone "138..." --json
jiesong supplier upsert --name "佛山A厂" --json

jiesong product search --keyword "瓷砖" --json
jiesong product get --id <id> --json

jiesong purchase parse-quote --text "100平方米瓷砖，单价45元，供应商佛山A厂" --json
jiesong purchase create --file purchase.json --json
jiesong purchase get --id <id> --json
jiesong purchase list --keyword "CG26" --json

jiesong hscode search --keyword "瓷砖" --json
jiesong hscode batch-match --file items.txt --json

jiesong dashboard track-product --product "瓷砖" --store "Milpitas" --json
```

### Exit Codes

- `0` success
- `2` invalid arguments
- `3` not found
- `4` auth failure
- `5` authorization failure
- `6` validation or business rule failure
- `7` transport or server error

## MCP-Ready Design

### Rule

The MCP server should expose the same business capabilities, not a separate API worldview.

### Phase-1 MCP Tools

- `search_entities`
- `get_purchase`
- `list_purchases`
- `create_purchase_with_items`
- `upsert_supplier`
- `search_products`
- `search_hs_codes`
- `batch_match_hscode`
- `track_product`

### Tool Style

- Prefer business names over raw REST names
- Return structured content
- Keep read/write annotations accurate

## Backend Gaps To Close Before CLI

### 1. Unified Search API

Today the web aggregates search in the frontend. CLI and MCP need a backend-native search entry.

Add:

- `GET /api/v1/search?q=<query>&types=product,supplier,purchase,sales`

This should return normalized result objects with:

- `type`
- `id`
- `title`
- `subtitle`
- `score?`

### 2. Atomic Purchase Creation

The purchase UI submits items, but current backend create flow is still header-first.

Add a task-level endpoint or enhance existing create:

- `POST /api/v1/purchases`

to support transactional creation of:

- purchase header
- purchase items
- computed total
- audit record

This is required for agents.

### 3. Agent Authentication Middleware

Add middleware that can authenticate:

- human JWT
- agent token

without confusing actor identity.

### 4. Audit Actor Expansion

Current audit model assumes user-only actors. This must be expanded before agent writes go live.

## Suggested Repository Structure

```text
backend/
  src/
    agent/
      auth/
      permissions/
      commands/
      sdk/
      cli/
      mcp/
```

Suggested breakdown:

- `commands/`: typed business actions
- `sdk/`: request client and auth helpers
- `cli/`: argument parsing and output rendering
- `mcp/`: tool definitions, thin wrapper over commands

## Rollout Plan

### Phase 1: Foundation

- add `AgentAccount`, `AgentCredential`, `AgentGrant`
- add dual-actor audit model
- add backend unified search endpoint
- add transactional purchase create-with-items flow

### Phase 2: Command Layer

- implement search, supplier, product, purchase command handlers
- standardize machine error contracts

### Phase 3: CLI

- implement `jiesong` CLI
- ship auth, search, supplier create/upsert, product search, purchase create, HSCode commands
- verify all support `--json`

### Phase 4: Agent Hardening

- idempotency keys on create flows
- credential rotation
- revocation
- rate limits
- optional IP allowlist

### Phase 5: MCP

- expose selected command layer actions as MCP tools
- keep initial tool set small and high-signal

## Verification Strategy

For this architecture to be considered ready for implementation:

1. Search use case must work end-to-end via one command
2. Supplier create/upsert must work end-to-end via one command
3. Purchase create with items must work transactionally
4. Every agent write must generate an audit log with `actorType=AGENT`
5. Revoking an agent credential must immediately block future requests
6. CLI and future MCP must use the same command semantics

## Recommendation

Proceed with `CLI + MCP-ready`, but implement in this order:

1. service-account identity model
2. backend command-friendly APIs
3. command layer
4. CLI
5. MCP wrapper

This keeps web, CLI, and future external agents aligned around one authoritative business core.
