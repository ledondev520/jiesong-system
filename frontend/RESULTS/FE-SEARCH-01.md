# FE-SEARCH-01

## Outcome
- Completed.
- Added `src/services/dashboardSearch.service.ts`.
- Header search no longer directly fans out to five endpoints inside `Header.tsx`.
- Search now uses a staged aggregation strategy:
  - first `products + suppliers`
  - then `containers + purchases + sales` only when needed

## Verification
- `npm run test -- src/components/layout/Header.test.tsx src/services/dashboardSearch.service.test.ts`
- `npm run lint -- src/components/layout/Header.tsx src/components/layout/Header*.tsx src/services/dashboardSearch.service.ts src/services/dashboardSearch.service.test.ts`
- `npm run build`

## Notes
- The current implementation is still a frontend aggregation layer.
- If ranking, authorization, or entity breadth grows, the next step should be a backend unified search endpoint.
