# Frontend Development Plan - Jiesong System

## Status
- [x] Phase 1: Initialization
- [x] Phase 2: Core Architecture
- [x] Phase 3: Layout & Auth
- [ ] Phase 4: Feature Implementation (P0/P1)
  - [x] Dashboard Home
  - [x] Product Management
  - [x] Supplier Management (Aliases, Quality Issues)
  - [x] Store Management (Port Association)
  - [x] Purchase Management (Contract, AI Input, File Upload)
  - [x] Sales Management (Contract, Smart Pricing)
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
- [x] Install dependencies
- [x] Initialize shadcn-ui
- [x] Setup Directory Structure

## Phase 2: Core Architecture
- [x] Define Types (`src/types/index.ts`) matching Database Schema.
- [x] Setup Axios Client (`src/lib/axios.ts`).
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
  - [x] List View, Create/Edit Dialog
- [x] Supplier Management
  - [x] List View (Quality Badges), Create/Edit Dialog (Alias Array)
- [x] Store Management
  - [x] List View (Port Badges), Create/Edit Dialog
- [x] Purchase Management
  - [x] List View
  - [x] Create Page (AI Parsing Mock, File Upload UI, DatePicker)
- [x] Sales Management
  - [x] List View
  - [x] Create Page (Smart Pricing Calculator, Multi-store Support)
- [ ] Inventory Management
- [ ] Container Management

## Phase 5: Alignment & Integration
- [ ] Review API calls against backend implementation.
- [ ] Test end-to-end flows.
