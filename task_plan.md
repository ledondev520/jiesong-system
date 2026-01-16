# Frontend Development Plan - Jiesong System

## Status
- [x] Phase 1: Initialization
- [x] Phase 2: Core Architecture
- [x] Phase 3: Layout & Auth
- [ ] Phase 4: Feature Implementation (P0/P1)
  - [x] Dashboard Home
  - [x] Product Management (Basic CRUD)
  - [x] Supplier Management (Aliases, Quality Issues)
  - [x] Store Management (Port Association)
  - [ ] Purchase Management (Contract, AI Input, Payments)
  - [ ] Sales Management (Contract, Pricing, Collections)
  - [ ] Inventory Management (Status Flow)
  - [ ] Container Management (Loading, Tracking)
- [ ] Phase 5: Alignment & Integration

## Goals
- Build a responsive frontend using Next.js 14, Tailwind CSS, and shadcn/ui.
- Implement core features as per `docs/PRD.md` and `docs/技术方案.md`.
- Ensure data models align with `docs/数据库设计.md`.
- Collaborate with backend (Express + Prisma) via RESTful API.

## Phase 1: Initialization
- [x] Initialize Next.js project: `frontend`
- [x] Install dependencies (`lucide-react`, `zustand`, `axios`, `sonner`, etc.)
- [x] Initialize shadcn-ui
- [x] Setup Directory Structure

## Phase 2: Core Architecture
- [x] Define Types (`src/types/index.ts`) matching Database Schema.
- [x] Setup Axios Client (`src/lib/axios.ts`) with Base URL and Interceptors.
- [x] Create Auth Store (`src/store/auth.store.ts`).
- [x] Create Shared Constants (`src/lib/constants.ts`).

## Phase 3: Layout & Auth
- [x] Implement Login Page (`src/app/(auth)/login/page.tsx`).
- [x] Implement Dashboard Layout (`src/app/(dashboard)/layout.tsx`).
  - [x] Sidebar Component
  - [x] Header Component
  - [x] Global Toaster

## Phase 4: Feature Implementation (P0)
- [x] Dashboard Home (`src/app/(dashboard)/page.tsx`)
- [x] Product Management
  - [x] List View
  - [x] Create/Edit Dialog
  - [x] Service Layer
- [x] Supplier Management
  - [x] List View (Quality Badges)
  - [x] Create/Edit Dialog (Alias Array, Quality Issue Toggle)
  - [x] Service Layer
- [x] Store Management
  - [x] List View (Port Badges)
  - [x] Create/Edit Dialog (Port Selection)
  - [x] Service Layer
- [ ] Purchase Management
- [ ] Sales Management
- [ ] Inventory Management
- [ ] Container Management

## Phase 5: Alignment & Integration
- [ ] Review API calls against backend implementation.
- [ ] Test end-to-end flows.
