# Risk Register

| ID | Trigger | Impact | Mitigation | Rollback Point | Status |
| --- | --- | --- | --- | --- | --- |
| R1 | Backend expects different customs declaration fields | Create/update pages may submit incompatible payloads | Keep payload explicit, typed, and close to common trade/customs fields; isolate in one shared form component | Revert new service + form files only | Open |
| R2 | Reusing dashboard layout at top-level route causes navigation/auth regressions | `/customs-declarations` could render without shell or mis-handle redirects | Implement a dedicated route layout wrapper that composes the existing dashboard layout | Remove new route layout and move route under dashboard if required | Open |
| R3 | Coverage below target after adding new files | Feature is incomplete by repo standard | Add page and component tests before implementation and measure targeted coverage | Trim untested helpers and add focused tests | Open |
| R4 | Public service pages diverge from current frontend language | New public pages feel detached from the rest of the product | Reuse existing theme tokens, typography, and shadcn/ui surfaces | Rework only `src/components/public/service-page.tsx` and route wrapper content | Closed |
| R5 | Repo-wide coverage obscures new-feature quality | Historical files keep global coverage below the requested threshold | Run targeted coverage against the three new feature files and record the command | Re-run coverage before final handoff | Closed |
