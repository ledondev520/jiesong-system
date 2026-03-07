# Task Board

| ID | Priority | ETA | Slot | Status | Input | Output | Validation | DoD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CD-01 | P0 | 20m | 1 | DOING | Existing dashboard/product CRUD patterns | Checkpoint files, feature plan, failing tests | `vitest` targeted tests fail for expected missing behavior | Plan files created and first red tests added |
| CD-02 | P0 | 20m | 1 | TODO | Failing route/form tests | `customs-declarations` routes, components, service, types | Targeted `vitest` for feature passes | List/detail/create/edit routes work and match repo patterns |
| CD-03 | P0 | 15m | 1 | TODO | Implemented feature | Verification artifacts and metrics updates | `npm run test -- --coverage`, `npm run lint`, `npm run build` | All checks green and metrics recorded |
| PF-01 | P0 | 10m | 2 | DONE | Public route requirements, existing page/test patterns | Failing tests for shared public service page and both routes | `npm test -- src/components/public/service-page.test.tsx src/app/forex-verifications/page.test.tsx src/app/tax-refunds/page.test.tsx` | Missing-feature failures verified before implementation |
| PF-02 | P0 | 20m | 2 | DONE | PF-01 failing tests | Shared service-page component and both public route wrappers | Same targeted `vitest` command | Both routes render route-specific content and CTA links |
| PF-03 | P0 | 15m | 2 | DONE | Implemented public route files | Metrics, result summary, and patch artifact | `npm run lint -- ...`; targeted coverage command | Validation passed and artifacts updated |
