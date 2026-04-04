# Task Plan

## Goal

Integrate `open-agent-sdk-typescript` into `jiesong_system` as an in-process Agent Runtime:
- keep current business system as the source of truth
- add preset business agents: unified, finance, export, executive
- expose a first backend runtime entry under the existing `/ai` domain
- keep write-capable actions behind explicit user confirmation
- reuse current audit and AI data models instead of default filesystem-only session persistence

## Phases

| Phase | Status | Notes |
| --- | --- | --- |
| Assess SDK fit against current AI/agent architecture | completed | Confirmed SDK is a viable runtime core, not a full app replacement |
| Reframe plan and define MVP boundaries | completed | Landed as one shared runtime with unified + domain presets and audited entrypoints |
| Add failing tests for route/controller/service boundaries | completed | Runtime route/controller/service smoke tests landed; 2026-04-03 added failing service test for history endpoint mismatch |
| Implement SDK-backed runtime + preset tools | completed | `/ai/agents/*`, unified assistant, domain tools, pendingAction confirmation flow, CLI and HTTP MCP are in repo |
| Close the loop on composite diagnostics | completed | Composite diagnostics now emit structured recommendedActions and sessions/history can replay those recommendations in the governance UI |
| Promote safe recommendations into executable confirmations | completed | Added trade-compliance draft actions, bridged confirmable recommendations into pendingActions, and surfaced recommendations in the live assistant |
| Verify and checkpoint repo ledgers | completed | Targeted backend/frontend verification passed and status docs were refreshed on 2026-04-04 |

## Key Decisions

- Use the SDK as the agent execution kernel, not as a replacement for current backend modules.
- Preserve current Prisma models (`ChatHistory`, `TokenUsage`, `OperationLog`, `AgentAccount`, `AgentCredential`) as the durable audit layer.
- Start with one shared runtime plus a unified assistant and domain presets instead of building separate runtimes.
- Controlled write actions are allowed only through `pendingAction -> explicit user confirmation -> executor` flow; the agent must not self-execute writes.
- Current doc gap to keep tracking: frontend history reload had a path mismatch (`/ai/chat-history` vs `/ai/history`) and markdown status files were behind the implementation.
- V2 direction is now fixed: `unified` is the only primary external agent; finance/export/executive remain legacy internal modes or future hidden routing capabilities.
- Implementation kickoff has started with a first tool registry abstraction, broader cross-domain read tools (`SearchEntities`, procurement, suppliers, inventory, tax-compliance, recent events), and lightweight message-based internal routing.
- Route metadata is now part of the runtime contract: sessions and history can expose `routePlan`, `domainsTouched`, and `selectedToolNames` for observability in the AI sessions surface.
- Tool execution telemetry is now also part of the runtime contract: tool calls are summarized into `toolTraceSummary` and persisted into Agent metadata / AGENT_RUN event details.
- Write capability is moving from "few hard-coded finance/system writes" toward broader but role-aware mutation tools: procurement, supplier, inventory status, while still keeping confirmation gates.
- Tool governance is now a user-visible surface: the registry is exposed via API, summarized in the AI sessions page, and the session detail can replay toolTrace items instead of hiding them in metadata.
- Tool governance has become role-aware: registry payloads can be built for the current viewer role, including domain-level available counts for what the current role can actually use.
- Tool domains are now moving from basic lookup to composite diagnostics: the universal agent has first-pass workflow tools for export contract flow, purchase execution, and trade-compliance readiness, instead of only overview/detail lookups.
- Registry metadata now distinguishes composite tools from basic tools via `isComposite`, and domain summaries expose `compositeToolCount` so governance can see which domains already support complex task execution.
- Composite diagnostics now produce structured `recommendedActions`, and runtime metadata persists those recommendations so the AI sessions surface can replay not just which tools ran, but which actions they suggested.
- The first executable recommendation bridge is now live only for safe draft actions in the trade-compliance domain: diagnostics can emit `confirmable_write` recommendations, runtime materializes them into `pendingActions`, and the assistant shows both the recommendation and the confirmation card.
- The next bridge slice is finance-specific and intentionally narrow: DiagnoseSalesContractFlow can now upgrade receivable follow-up into an `AllocatePayment` recommendation only when exactly one unallocated receipt uniquely references the contract and its remaining amount matches the receivable gap; ambiguous matches stay manual.
- Governance replay now includes materialized confirmation steps: pending actions generated during a run are persisted as `pendingActionSummary` and can be replayed from sessions/history, not only seen in the live assistant.
- Pending action replay now merges final outcomes from `OperationLog`, so sessions/history can show whether a generated action stayed pending, was executed, was cancelled, or failed, without rewriting historical chat rows.
- Replay now also reconstructs a lightweight lifecycle timeline for each pending action by combining metadata creation snapshots with ordered action outcome logs, giving sessions/history a real created-to-final-state narrative without adding new persistence tables.
- Governance visibility now extends to the sessions list itself: each session can summarize pending-action status counts so operators can scan for outstanding or failed action-heavy conversations without opening detail dialogs first.
- The sessions list now also surfaces first-pass triage signals: whether a session has failed actions and when the latest action happened, still without changing backend contracts.
- The next logical step after surfacing these signals is no longer more display work but interaction control: sort and filter sessions by failed actions and recent action activity.
- That list-level prioritization is now in place with a fixed action-risk order and an action-state filter; the next step is optional user-controlled sorting rather than more hard-coded display signals.
- User-controlled sort switching is now in place on top of the action-state filter, keeping risk-first as default while allowing recent-action and recent-message inspection modes.
- The sessions list governance state now round-trips through URL query params (`sort`, `actionFilter`) so refresh and shared links preserve the current triage view.
