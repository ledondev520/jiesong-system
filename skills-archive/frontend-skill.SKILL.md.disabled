---
name: frontend-skill
description: This skill should be used when the user asks to "frontend-skill", "build a frontend", "create a page", "design a UI", "make a component", "polish the frontend", or otherwise needs production-grade frontend implementation in this repository.
version: 0.1.0
---

This project-local skill is a compatibility install for environments that expect a `frontend-skill` entry. Use it as the default frontend skill in this repository.

## Purpose

Build or refine frontend pages, components, and flows with production quality while staying inside this repository's design rules.

## Repository Rules

- Follow the repository requirement that all frontend work use the shadcn/ui design language.
- Prefer existing shadcn/ui components and shared primitives before creating new UI abstractions.
- Keep design tokens, spacing, radius, shadows, and typography aligned with the existing theme.
- Preserve responsive behavior on desktop and mobile.
- Avoid generic AI-looking UI; keep the result intentional, but do not break the established system.

## Use This Skill For

- New pages, forms, dashboards, tables, and detail views
- Visual polish and layout cleanup
- Refactoring custom UI toward shadcn/ui patterns
- Accessibility and state completeness for loading, empty, error, and disabled states

## Workflow

1. Inspect the existing route, component tree, and shared UI primitives.
2. Reuse existing shadcn/ui components where possible.
3. Define the information hierarchy before changing layout.
4. Implement the smallest change that achieves the requested outcome.
5. Check responsive behavior and interaction states.
6. Run the narrowest relevant validation command before closing the task.

## Quality Bar

- Components should feel consistent with the rest of the application.
- UI should be readable at normal dashboard density.
- Empty states, validation states, and destructive actions should be explicit.
- Styling should be deliberate but not decorative for its own sake.
- Any custom component should still read as an extension of shadcn/ui.

## Notes

- This local skill exists because the current session cannot install from GitHub.
- The closest preinstalled upstream skill available in the environment is `frontend-design`.
- If network access is restored later, this compatibility skill can be replaced by the requested upstream package if it exists.
