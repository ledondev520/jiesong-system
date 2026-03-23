# 2026-03-23 Frontend Next Iterations Round 6

## Scope
- `FE-AI-01`

## Goal
- Continue `docs/frontend-next-iterations-2026-03.md`.
- Make the AI assistant less intrusive by default.

## Planned Work
- Add failing tests for:
  - mount exclusion on `/dashboard/ai/*`
  - quieter trigger and right-side panel semantics
- Update `LazyAIAssistantMount.tsx`.
- Update `AIAssistant.tsx` without changing its existing chat/upload/SSE core behavior.

## Result
- The AI workspace no longer also mounts the global assistant.
- The assistant opens from a quieter trigger.
- The assistant UI is now a right-side panel instead of the louder floating bubble.

## Verification
- `cd frontend && npm run test -- src/components/ai/AIAssistant.test.tsx src/components/ai/LazyAIAssistantMount.test.tsx`
- `cd frontend && npm run lint -- src/components/ai/AIAssistant.tsx src/components/ai/AIAssistant.test.tsx src/components/ai/LazyAIAssistantMount.tsx src/components/ai/LazyAIAssistantMount.test.tsx`
- `cd frontend && npm run build`

## Next
- `FE-MODULE-01`
- `FE-QA-01`
