# Customs Declaration Management

## Goal
- Deliver protected Next.js App Router pages for customs declaration list, detail, create, and edit flows at `/customs-declarations`.
- Reuse existing dashboard shell, shadcn/ui primitives, and `products`-style data/service patterns.

## Milestones
- M1: Define domain model, service contract, and reusable page components.
- M2: Implement list/detail/create/edit routes with shared form and status presentation.
- M3: Verify with focused unit tests, lint, build, and coverage reporting.

## Risks
- Backend payload shape for `/customs-declarations` is not discoverable from the frontend repo.
- Top-level protected route must reuse dashboard auth/layout cleanly without breaking navigation highlighting.
- Coverage needs to stay above 80% for the new feature slice.

## Mitigations
- Keep the client contract minimal and CRUD-aligned: standard list/get/create/update endpoints plus optional declaration items.
- Reuse the existing dashboard layout component in a dedicated route layout.
- Add focused Vitest coverage for list, detail, create, edit, and form normalization flows.

## Public Finance Service Pages
- Goal: deliver public informational routes at `/forex-verifications` and `/tax-refunds` with shadcn/ui primitives and the existing visual language.
- Milestones:
  - PF-1: add route and shared-component failing tests.
  - PF-2: implement a reusable public service-page component and route-specific wrappers.
  - PF-3: verify with targeted lint, tests, and coverage above 80% for the new feature slice.
- Risks:
  - Public routes could drift away from the current design system.
  - Repo-wide historical coverage is below the requested threshold, so verification must stay targeted to new files.
- Mitigations:
  - Reuse current CSS variables and shadcn/ui primitives instead of creating a separate landing-page system.
  - Record the exact targeted coverage command and results in `METRICS.md`.

## HSCode Frontend Integration
- Goal: deliver HSCode search APIs in the frontend and add smart matching to the product management flow at `/dashboard/products`.
- Milestones:
  - HS-01: add failing service/component tests for HSCode lookup and smart-fill behavior.
  - HS-02: implement `hsCode.service.ts` plus product-dialog smart matching and auto-fill for `hsCode` and `taxRate`.
  - HS-03: run focused tests/lint and checkpoint plan, tasks, metrics, risks, results, and patch artifacts.
- Risks:
  - Backend route implementation is not present in this checkout, so the frontend must target the route contract inferred from backend tests.
  - Product persistence currently does not include `taxRate`, so the frontend can only guarantee form auto-fill, not durable backend storage.
- Mitigations:
  - Bind the service to the tested backend contract `GET /hs-codes/search` and `GET /hs-codes/:code`.
  - Surface tax rate clearly in the form and pass it through submit payload without coupling the UI to backend schema changes.
