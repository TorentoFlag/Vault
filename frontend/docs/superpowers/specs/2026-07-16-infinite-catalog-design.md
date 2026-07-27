# Infinite catalog design

## Goal

The home CTA “Перейти в каталог” opens the independent `/catalog` route. The catalog keeps its existing filters, sorting, URL state, product cards, and marketplace visual system while presenting a four-column desktop product grid with automatic incremental loading.

## Interaction

- The initial catalog batch contains eight cards (two desktop rows).
- An `IntersectionObserver` watches a loading sentinel below the grid and reveals the next eight cards before the user reaches the bottom.
- Loading continues in a repeating demo feed so the locally mocked catalogue can demonstrate infinite scrolling without an API.
- Every repeated feed card links to the same real product detail route and uses a stable occurrence key. Cart behavior remains product-based, so one catalog item cannot be added twice.
- Changing search, category, filters, price, or sorting resets the feed to the first batch.
- A visible “Показать ещё” fallback remains available when automatic observation is unavailable or delayed.

## Responsive grid

- Wide desktop: 4 columns beside the filter sidebar.
- Medium desktop/tablet: 3 then 2 columns.
- Mobile: 1 column and the existing off-canvas filter panel.

## Accessibility and performance

- The loading status is announced through `aria-live`.
- Only the first four product images are prioritized; later cards remain lazy-loaded.
- Infinite-feed arithmetic is isolated in pure helpers and covered by unit tests.
- No new package or API is introduced.

## Scope

Only `concept-skins` is changed. `concept-initial`, the archived project, Git, and GitHub are not used.
