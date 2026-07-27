# Infinite Catalog Implementation Plan

> **For agentic workers:** Execute inline with test-driven development. Git operations are forbidden for this project.

**Goal:** Connect the home catalog CTA to `/catalog` and provide a four-column desktop catalog with automatic infinite card loading.

**Architecture:** Keep filtering and sorting in `CatalogScreen`, isolate demo-feed window calculations in `src/lib/catalog-feed.ts`, and use an `IntersectionObserver` sentinel to extend the rendered window. Existing product data and product-detail routes remain the source of truth.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, Node test runner.

## Global Constraints

- Modify only `/Users/anastasiavolkova/Documents/Vault/concept-skins`.
- Do not use Git or GitHub.
- Do not add dependencies.
- Preserve the approved visual system and existing filter URL behavior.

---

### Task 1: Catalog feed helper

**Files:**
- Create: `src/lib/catalog-feed.ts`
- Create: `src/lib/catalog-feed.test.ts`

- [ ] Write tests for initial batch size, growth, empty data, and occurrence identity.
- [ ] Run the focused test and confirm it fails because the helper does not exist.
- [ ] Implement deterministic feed-window helpers.
- [ ] Run the focused test and confirm it passes.

### Task 2: Infinite catalog UI

**Files:**
- Modify: `src/features/catalog/CatalogScreen.tsx`
- Modify: `src/features/catalog/catalog.module.css`
- Modify: `src/app/catalog/loading.tsx`

- [ ] Reset the visible window whenever serialized filters change.
- [ ] Add an observer sentinel and manual fallback control.
- [ ] Render stable occurrence keys and lazy-prioritize only the first row.
- [ ] Change desktop and loading grids to four columns with responsive 3/2/1 fallbacks.

### Task 3: Home navigation

**Files:**
- Modify: `src/features/home/Hero.tsx`

- [ ] Replace the in-page catalog anchor with a Next.js link to `/catalog`.

### Task 4: Verification

- [ ] Run focused and full tests.
- [ ] Run typecheck and lint.
- [ ] Run the production build.
- [ ] Verify home CTA navigation, four desktop columns, and multiple automatic feed batches in the browser.
