# 2026-03 Frontend Audit And Iteration Plan

## Scope

- Repository: `frontend/`
- Review date: `2026-03-22`
- Focus:
  - application shell
  - navigation information architecture
  - page structure and file boundaries
  - visual hierarchy and interface consistency
  - frontend verification baseline

## Snapshot

- App Router pages: `53`
- Client pages (`'use client'`): `46`
- Largest page files:
  - `frontend/src/app/dashboard/finance/statements/page.tsx` (`1128` lines)
  - `frontend/src/app/dashboard/sales/[id]/components/SalesDetailPageContent.tsx` (`922` lines)
  - `frontend/src/app/dashboard/store-recommend/page.tsx` (`905` lines)
  - `frontend/src/app/dashboard/purchase/create/components/CreatePurchasePageContent.tsx` (`705` lines)
- Current baseline on review day:
  - `cd frontend && npm run lint` -> failed
  - `cd frontend && npm run build` -> failed

## What Is Working

- shadcn/ui is already the primary UI substrate.
- Theme tokens in `globals.css` are coherent enough to support a stronger product language.
- The app shell model itself is directionally correct:
  - sidebar for module switch
  - header for global actions
  - module tabs for local navigation
- Several business pages already share `PageHeader`, semantic badges, amount text, and standardized tables.

## Core Findings

### 1. Baseline is not green

The frontend is still in a "moving target" state. Review cannot stop at visual polish because the current shell fails both lint and production build.

- `frontend/src/app/dashboard/layout.tsx`
- `frontend/src/app/dashboard/ai/sessions/page.tsx`

### 2. Navigation is fragmented across multiple sources of truth

Primary navigation and module navigation are duplicated across:

- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/layout/ModuleTabHeader.tsx`

This creates drift risk whenever routes, labels, permissions, or ordering change.

### 3. Route inventory has started to drift

There are stale or off-pattern pages still living in the route tree, notably:

- `frontend/src/app/dashboard/logs/page.tsx`

This page does not match the current shell or current IA and indicates old and new standards are coexisting.

### 4. Page files are too large and too client-heavy

The repository is using App Router, but most pages are still client pages with data fetching, layout, chart config, filters, dialogs, and rendering fused together.

This increases:

- regression risk
- review cost
- refactor cost
- visual inconsistency over time

### 5. Visual consistency exists, but product hierarchy is still weak

The dominant pattern is still:

- `ModuleTabHeader`
- `PageHeader`
- card row
- filter bar
- table/chart block

That is functional, but it makes different modules feel like variations of the same admin page instead of distinct workspaces.

### 6. The header is overloaded

`Header.tsx` currently owns:

- mobile navigation
- global search
- notification entry
- user menu
- date badge

It is also issuing multiple concurrent search requests. This is a strong signal that the shell needs one level of decomposition.

### 7. The AI assistant competes with primary workflows

The floating assistant is mounted across most business routes and sits above the interface as a global fixed action. In desktop it is noisy; in mobile it competes directly with task actions.

## Frontend-Skill Direction

### Visual thesis

Enterprise calm with sharp operational focus: dense information, fewer surfaces, stronger typography, and one restrained green accent carrying action and state.

### Content plan

- hero: not a marketing hero, but a first-screen operational anchor for each module
- support: the top 1-2 actions or alerts a user must see immediately
- detail: structured work area, not card mosaics
- final CTA: action rails attached to the page purpose, not generic floating affordances

### Interaction thesis

- subtle shell entrance on initial page load
- active module and active view should feel spatially locked, not merely highlighted
- hover/reveal motion should sharpen affordances, especially in action rows and list surfaces

## Iteration Strategy

### Phase 0: Recover the baseline

- fix current lint/build failures
- remove obvious dead or stale route entry points
- re-establish green verification before larger shell work

### Phase 1: Consolidate the shell

- create a single navigation registry
- derive sidebar items, mobile nav, and module tabs from the same config
- introduce one reusable module scaffold for header, actions, states, and content framing

### Phase 2: Break down oversized pages

Prioritize:

- finance statements
- AI sessions
- store recommend
- purchase create
- sales detail
- header

Target structure:

- route page
- data container
- workspace sections
- local dialogs and tools

### Phase 3: Rebuild the workspace hierarchy

- redesign the dashboard first screen around focus, alerts, and high-frequency actions
- reduce card saturation
- distinguish operations, procurement, export, and finance as separate work modes
- remove layout noise that does not aid scanning

### Phase 4: Performance and resilience

- simplify global search into a dedicated aggregated entry
- reduce shell-level client work
- keep heavy charts and inspectors behind clearer load boundaries
- add screenshot-based regression coverage for core pages

## Definition Of Done For This Initiative

- frontend `lint` passes
- frontend `build` passes
- navigation uses one registry
- stale shell routes are removed or redirected
- dashboard shell is visually calmer and more intentional
- at least one representative module page is upgraded from "card mosaic" to "workspace layout"
- checkpoints stay updated in `PLAN.md`, `TASKS.md`, `RISKS.md`, and `METRICS.md`
