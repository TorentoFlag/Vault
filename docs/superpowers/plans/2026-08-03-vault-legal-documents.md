# Vault Legal Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the supplied Privacy Policy and User Agreement with confirmed company details, while removing Refund Policy and Provably Fair from the legal document surface, including the refund section inside the agreement.

**Architecture:** Keep the existing Next.js legal shell and move its content model from summary-only bullets to typed paragraph/list blocks. Store the company identity in `frontend/src/config/site.ts`, consume it from the footer and legal shell, and keep the full supplied legal copy in `frontend/src/config/legal.ts`. Delete only the two standalone legal route pages; payment/support refund behavior is out of scope.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, Node test runner, npm scripts.

## Global Constraints

- Preserve the supplied legal wording except for the explicitly approved removal of the refund section, sequential renumbering, typographic spacing, and removal of the accidental sentence.
- Customer-facing prices and balances remain in Coins; this task does not change commerce behavior.
- No backend, provider, secret, deployment, production-data, or unrelated support changes.
- Use `apply_patch` for hand edits and preserve unrelated working-tree changes.
- Follow TDD: update focused tests, observe failure, implement the smallest change, then run focused and full frontend verification.

---

### Task 1: Lock the legal document and company contracts with failing tests

**Files:**
- Modify: `frontend/src/config/legal.test.ts`
- Modify: `frontend/src/config/site.test.ts`
- Modify: `frontend/src/components/layout/SiteFooter.tsx` only if a focused source assertion needs a stable seam; otherwise no change in this task

**Interfaces:**
- Consumes: current `legalDocuments` and `siteConfig` exports.
- Produces: executable expectations for the two remaining legal documents and the confirmed public company identity.

- [ ] **Step 1: Replace the old four-document assertions with the approved two-document contract.**

  Assert that ids are `privacy` and `terms`, that no document id/title contains `refund` or `provably`, and that both supplied headings plus company fields are present in the corresponding document content.

- [ ] **Step 2: Add company identity assertions to the site config test.**

  Assert the legal name is `SECURE KEYS - FZCO`, registration number is `52124`, the legal address contains `Dubai Silicon Oasis` and `IFZA Business Park`, and the support email is `support@vaultapp24.com`.

- [ ] **Step 3: Run the focused tests and verify they fail against the current placeholders/routes.**

  Run: `npm --prefix frontend test -- src/config/legal.test.ts src/config/site.test.ts`

  Expected: FAIL because the current config exposes four documents, placeholder company fields remain, and the supplied full legal headings are absent.

### Task 2: Implement the shared company identity and full legal content

**Files:**
- Modify: `frontend/src/config/site.ts`
- Modify: `frontend/src/config/legal.ts`
- Modify: `frontend/src/config/site.test.ts` only if the final typed shape needs an additional focused assertion
- Modify: `frontend/src/config/legal.test.ts` only if the final content contract needs an additional focused assertion

**Interfaces:**
- Consumes: approved test expectations from Task 1.
- Produces: `siteConfig.company` with `legalName`, `registrationNumber`, `legalAddress`, and `supportEmail`; a typed legal block model and full `privacy`/`terms` documents.

- [ ] **Step 1: Add the `siteConfig.company` object with the exact supplied fields.**

  Keep the existing support configuration for operational copy, and use the company object for repeated legal identity fields so the footer and legal surfaces cannot drift.

- [ ] **Step 2: Define typed legal content blocks.**

  Use a discriminated union with `paragraph` and `list` blocks, and make each document section contain ordered blocks. Keep the existing document id/href/title contract for the two retained routes.

- [ ] **Step 3: Add the full Privacy Policy text from the DOCX.**

  Preserve its title, introductory paragraphs, sections 1–10, company details, lists, Steam disclaimer, Cookie information, user rights, support email, and `/privacy` publication reference. Normalize only missing spaces after labels such as `Наименование:`.

- [ ] **Step 4: Add the full User Agreement text from the DOCX with the approved deletion.**

  Preserve the introductory warning and sections 1–8 and 10–19 content, omit the entire original section 9 `ВОЗВРАТ СРЕДСТВ`, omit `Отлично, завершаем документ.`, and renumber the original sections 10–19 to 9–18 in the rendered headings.

- [ ] **Step 5: Run the focused tests and verify they pass.**

  Run: `npm --prefix frontend test -- src/config/legal.test.ts src/config/site.test.ts`

  Expected: PASS with no document-id, heading, copy, or company-identity failures.

### Task 3: Render the new content and remove obsolete legal surfaces

**Files:**
- Modify: `frontend/src/features/legal/LegalDocumentShell.tsx`
- Modify: `frontend/src/features/legal/legal-shell.module.css`
- Modify: `frontend/src/components/layout/SiteFooter.tsx`
- Delete: `frontend/src/app/legal/refund/page.tsx`
- Delete: `frontend/src/app/legal/provably-fair/page.tsx`

**Interfaces:**
- Consumes: typed legal blocks and `siteConfig.company` from Task 2.
- Produces: readable legal pages with only two navigation entries, real company details in the footer, and no obsolete routes.

- [ ] **Step 1: Render ordered paragraph/list blocks in the existing shell.**

  Add document intro paragraphs and render each `paragraph` as a paragraph and each `list` as a `ul`; retain the current breadcrumb, sidebar, summary, support CTA, and responsive layout.

- [ ] **Step 2: Replace placeholder footer requisites with the shared company fields.**

  Render the legal name, `Registration Number`, legal address, and support email while preserving the current footer composition and payment/disclaimer sections.

- [ ] **Step 3: Remove the two standalone route files and all active footer/sidebar links to them.**

  Do not remove the existing support request category for refund questions; only the public legal-document routes and links are removed.

- [ ] **Step 4: Add CSS for long legal paragraphs and address wrapping without changing the visual language.**

  Ensure ordered copy has readable line-height, section spacing, and no horizontal overflow on narrow screens.

- [ ] **Step 5: Run the focused legal tests and a source-level route/reference audit.**

  Run: `npm --prefix frontend test -- src/config/legal.test.ts src/config/site.test.ts`

  Run: `rg -n 'legal/(refund|provably-fair)|Политика возвратов|Provably Fair' frontend/src`

  Expected: focused tests PASS; the reference audit returns no active legal-page/footer/sidebar matches. Support category matches are allowed only in support code/tests.

### Task 4: Verify the frontend release surface

**Files:**
- Inspect: all changed files and `git diff --check`

**Interfaces:**
- Consumes: completed implementation from Tasks 1–3.
- Produces: fresh verification evidence for legal content, route removal, type safety, lint, build, and repository cleanliness within the owned diff.

- [ ] **Step 1: Run frontend tests.**

  Run: `npm --prefix frontend test`

- [ ] **Step 2: Run typecheck, lint, and build.**

  Run: `npm --prefix frontend run typecheck`

  Run: `npm --prefix frontend run lint`

  Run: `npm --prefix frontend run build`

- [ ] **Step 3: Inspect the built route list and confirm obsolete routes are absent.**

  Run: `rg -n '/legal/(privacy|terms|refund|provably-fair)' frontend/.next frontend/out 2>/dev/null`

  Expected: privacy and terms remain in the generated output; refund and provably-fair do not have generated route directories or page entries.

- [ ] **Step 4: Inspect the final diff and whitespace.**

  Run: `git diff --check && git status --short && git diff --stat`

  Confirm only the approved docs/config/legal/footer/route paths changed and no generated artifacts or unrelated user work were overwritten.
