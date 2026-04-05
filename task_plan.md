# Task Plan

## 2026-04-04 Checkpoint

- Root cause confirmed for the latest AI sessions regression: the transient `auto` governance state was being persisted through the same localStorage path as explicit user preferences, so one failed-first bootstrap could overwrite durable sort/filter preferences.
- Current fix boundary: keep automatic failed-first triage for the active dataset, but prevent `auto`-sourced state from being written back into localStorage.
- Latest governance provenance checkpoint: replay signals now expose an explicit source contract (`session-metadata / none`) on the server boundary, so the list can explain not just replay depth but also where that replay capability currently comes from.
- Latest service-boundary checkpoint: replay provenance is no longer classified ad hoc inside `aiController`; a dedicated `governanceReplayService` now builds one shared replay profile for sessions/history, and the page can render from that profile directly.
- Latest evidence-strength checkpoint: replay source can now upgrade from `session-metadata` to `session-metadata+operation-log` when merged pending-action timelines include post-create lifecycle events from operation logs.
- Latest evidence-visibility checkpoint: replay profiles now carry explicit evidence counts, so the UI can show how many operation-log lifecycle events support the current replay source.
- Latest persistence checkpoint: agent run metadata now stores a baseline governanceReplayProfile snapshot, and read paths can reuse that persisted profile before applying runtime evidence upgrades.
- Latest fallback-source checkpoint: when metadata lacks a replay baseline, sessions/history can now recover one from `AGENT_RUN` logs, giving replay provenance a second persisted source beyond chat metadata.
- Latest dedicated-source checkpoint: replay baselines now also have a dedicated `AGENT_REPLAY_SNAPSHOT` log source, which is preferred over generic `AGENT_RUN` fallback and exposed in the UI as 回放快照.
- Latest model-source checkpoint: replay baselines now also persist into a dedicated `AgentReplaySummary` model, which is read before snapshot/log fallbacks and gives provenance its first non-log summary store.
- Latest service-layer checkpoint: `AgentReplaySummary` record building, upsert, and map loading are now centralized in `agentReplaySummaryService`, so replay summary persistence no longer lives as ad hoc helper logic inside controller/runtime files.

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
- The governance preset row is now sticky, keeping the most important triage controls visible while operators scroll through long session lists.
- Session rows now carry two explicit governance layers of their own: SLA severity badges (`P1 / P2 / P3`) and duty-state hints (`需立即处理 / 待人工确认 / 已闭环`) across both desktop and mobile list views.
- The page header area now also exposes one duty-summary alert that explains the current triage focus (failed-first, pending-confirmation, or cleared) and links directly into the matching preset view.
- That duty-summary alert now also expresses simple aging/escalation hints: failed-action sessions older than 4 hours and pending confirmations older than 2 hours are called out inline so the operator can distinguish fresh issues from stale ones.
- Those aging signals are now also surfaced as explicit summary badges (`超时失败 X`, `超时待确认 Y`) so operators can scan stale workload without parsing the full descriptive sentence.
- The default risk sort now also consumes those aging signals directly: overdue failed sessions rise above overdue pending sessions, which in turn rise above fresh failed/pending sessions, while the other sort modes stay unchanged.
- The page now also explains that behavior explicitly when `risk` sorting is active, so operators see the ranking rule instead of inferring it from row order alone.
- The page now also explains governance-view source for the most important paths: it distinguishes automatic failed-first takeover from later manual operator overrides, reducing ambiguity about why the current filter/sort state is active.
- Automatic failed-first takeover is now fully transient: it no longer persists through localStorage or URL query params, so the UI can explain that the page temporarily switched into a failed-first view without silently turning that state into a durable preference or share link.
- The governance surface now also exposes whether the current list is backed by auditable replay metadata, using existing persisted tool/action summaries to tell the operator that the visible governance signals can be replayed in detail.
- That auditability hint now also has a server-boundary contract: controller responses can explicitly mark governance replay availability, and the UI prefers that explicit field over pure client-side inference.
- Provenance is now a little richer than a boolean: controller responses can also summarize which replay layers are present (tools, recommendations, actions), and the UI surfaces those layers as compact badges at the list level.
- Provenance now also has a normalized level on the server boundary, so the UI can show one compact replay-level badge without re-deriving the precedence rules client-side.
- That normalized replay level now also surfaces at the per-session row/card level, so operators can see replay depth without relying only on the global header strip.
- Provenance now also exposes an explicit source on the server boundary, and the UI surfaces that source as `回放来源：会话元数据` so operators can distinguish metadata-backed replay from future stronger audit sources.
- Provenance classification itself has now moved behind a dedicated backend service, which emits one `governanceReplayProfile` object and keeps the existing flat fields as compatibility output instead of leaving replay rules embedded in the controller.
