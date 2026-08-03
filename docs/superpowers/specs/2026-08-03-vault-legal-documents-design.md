# Vault legal documents design

## Goal

Publish the supplied Russian Privacy Policy and User Agreement on Vault, show the confirmed company identity publicly, and remove the standalone Refund Policy and Provably Fair documents from the customer-facing legal surface.

## Approved scope

- `/legal/privacy` renders the supplied Privacy Policy and Personal Data Processing Policy.
- `/privacy` is an alias for the privacy document because that is the publication URL included in the supplied policy text.
- `/legal/terms` renders the supplied User Agreement.
- The User Agreement section `9. ВОЗВРАТ СРЕДСТВ` is removed as requested. Later section numbers are renumbered sequentially from 9 through 18.
- The standalone `/legal/refund` and `/legal/provably-fair` routes, document navigation entries, and footer links are removed.
- Company details are stored once in the shared public site configuration and rendered in the footer and the legal documents' supplied company sections.
- The accidental sentence `Отлично, завершаем документ.` in the supplied agreement is omitted as editorial noise.

## Content and rendering

Legal copy remains maximally verbatim to the supplied DOCX files, with only typographic spacing around labels, removal of the approved refund section, sequential renumbering after that deletion, and removal of the accidental sentence. The content model uses typed blocks for paragraphs and lists so Russian headings, numbered sections, and list structure remain readable instead of being flattened into generic bullets.

The existing Vault legal shell and visual language remain in place. The sidebar contains only Privacy Policy and User Agreement. The footer keeps its current layout and adds the actual legal name, registration number, legal address, and support email. The legal page metadata identifies the company rather than the current local/demo wording.

## Testing and acceptance

- Focused legal config tests prove the exact two-document order, unique routes, company details, supplied headings, removal of the refund section, removal of the accidental sentence, and absence of Provably Fair/refund document ids.
- Footer source tests prove the real company fields are rendered and deleted legal links are absent.
- Typecheck, lint, frontend tests, and production build pass.
- The generated route list contains `/legal/privacy` and `/legal/terms` but no `/legal/refund` or `/legal/provably-fair`.

## Non-goals

- No backend legal module or database migration is added in this frontend-only content change.
- No changes are made to payment/refund processing, support categories, wallet behavior, or provider integrations.
- No deployment or production data change is performed.
