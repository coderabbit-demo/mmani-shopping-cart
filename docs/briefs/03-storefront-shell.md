# Brief 03 — `feat: storefront shell + browse`

**Mode:** brownfield feature. The domain goldens stay byte-identical; this PR adds new page goldens. **Jira:** SC-6
**Read first:** `docs/PLAN.md` (PR 3 section, "Visual design: CodeRabbit brand"), `docs/BRAND.md` and `AGENTS.md`.

## Assumptions (verified 2026-10-28 on main c5c2282)

- `app/` holds only `layout.tsx` (bare `<html><body>`) and `page.tsx` (an `<h1>DeskDrop</h1>`). There is no `components/`, `public/` or `app/globals.css` yet.
- `package.json` already has `lucide-react` ^1.63.0 and `@playwright/test` ^1.64.1. No dependency change is needed. `test:e2e` is a placeholder that prints "no e2e tests yet (Playwright arrives in PR 3)".
- `.github/workflows/ci.yml` has `typecheck`, `unit` and `golden` jobs on Node 22. It has no e2e job.
- `scope-gate.sh` protects `package.json`, `package-lock.json`, `.github/*` and `tests/golden/*`. This brief gives `ALLOW:` lines for the ones it needs.
- `tsconfig.json` includes `**/*.ts` and `**/*.tsx`, so Playwright specs and config are typechecked. Paths have no `@/` alias; use relative imports, or add the alias to `tsconfig.json` only if you list it (it is not in ALLOW, so prefer relative imports).
- `lib/catalog.ts` exports `categories` (`"All objects"` first), `products` (8), `productById` and `money`. A `Product` has `id, name, subtitle, description, price, category, art, background, colors[{name,hex}], badge?, rating, details, inStock`. `art` is one of `lamp, keyboard, headphones, plant, stand, mat, organizer, clock`.
- `lib/store.ts` exports pure `initialState`, `addItem(state, product, color, quantity)`, `toggleWishlist(state, productId)` and the rest. All are pure and need no change.
- `scripts/golden/capture.mjs` inventories only `tests/golden/domain/`, `MANIFEST.sha256` and `BASELINE`. A sibling directory `tests/golden/pages/` does not affect `golden:check`.
- Next 16.4.3's `next/font/google` knows **Geist** (weights 100–900, latin subset). It downloads at build time, which works in CI.
- Playwright 1.64.1 supports `expect(locator).toMatchAriaSnapshot({ name })` with snapshot files placed by `snapshotPathTemplate`, and `page.emulateMedia({ colorScheme })`.
- **Official CodeRabbit logotypes** (coderabbit.ai/brand, "White logotype" for dark backgrounds and the orange logotype for light backgrounds):
  - `https://www.coderabbit.ai/content/assets/white-typemark.svg`, sha256 `a05d72ea8ff2db89017e6e064d71609be51a3216a4f09eb73293e6b95b1757ec`, viewBox 2152×313;
  - `https://www.coderabbit.ai/content/assets/orange-typemark.svg`, sha256 `98f494c148147fc7c11b8ac2587ccdeb77bcfbb99ba563e009caf8323d4877d6`, viewBox 2152×314.
- **Hack v3.003** (the brand page links its release), from `https://github.com/source-foundry/Hack/releases/download/v3.003/Hack-v3.003-webfonts.zip`:
  - `web/fonts/hack-regular.woff2`, sha256 `0b0ef254dfc7afc172528e3166eace813989e1cf77f576ddae5f5e8fb2897c06`;
  - `web/fonts/hack-bold.woff2`, sha256 `d5a65190e12d1d7a4e804085dc3cc2bc8264ba0f63351bb8c8905c501fa69aa3`;
  - license: `https://raw.githubusercontent.com/source-foundry/Hack/v3.003/LICENSE.md`, sha256 `1f61bb7c790c59b4b0ecdf304628b94e42ae4c8020094a8c3da73381ab212623` (MIT, plus the Bitstream Vera license).
- **Mauve neutrals** from coderabbit.ai's own CSS (`--color-cui-mauve-N`). Dark scale: 1 `#121014`, 2 `#1a181d`, 3 `#232127`, 6 `#3c3841`, 7 `#4a464f`, 11 `#b5b2b9`, 12 `#efedf0`. Light scale: 1 `#fdfdfe`, 2 `#faf8fb`, 3 `#f1eff3`, 6 `#dbd7df`, 7 `#d0ccd5`, 11 `#65616a`, 12 `#211f24`.
- Contrast facts that shape the tokens: dark text (mauve-1 dark) on CR Orange passes AA (about 6:1); white on CR Orange does not (about 3:1). CR Orange and CR Cobalt as small text on the light background do not pass AA, so the light theme needs darker text shades for links and active text.

## Goal

The store looks like a CodeRabbit-branded product and you can browse it: header, mobile navigation, live bag and wishlist counts, a footer with the "Built with CodeRabbit" credit, and a home page with search, category filter, in-stock filter, sort and quick-add. Playwright arrives and runs in CI.

## Deliverables

1. **Brand assets, committed byte-identical to the verified files:**
   - `public/brand/white-typemark.svg` and `public/brand/orange-typemark.svg` (unmodified; their sha256 must match above);
   - `public/fonts/hack-regular.woff2`, `public/fonts/hack-bold.woff2` and `public/fonts/HACK-LICENSE.md` (sha256 must match above).

   If you cannot download, stop and say so; do not redraw or substitute.

2. **`app/globals.css`:**
   - A `:root` token block (dark, the default) and a `@media (prefers-color-scheme: light) { :root { … } }` block. These two blocks are the **only** place raw color values appear.
   - Tokens: at least the eight in `docs/BRAND.md` (`--color-primary`, `--color-accent-mint`, `--color-accent-cobalt`, `--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-border`), plus `--color-on-primary` (text on orange buttons), `--color-link` and `--color-active-text`. Each theme picks shades that pass AA (4.5:1 for text, 3:1 for focus rings and large text). List every token and its value per theme in the report.
   - Product art colors are tokens too (for example `--art-bg`, `--art-detail`, `--art-accent`).
   - `@font-face` for Hack Regular 400 and Bold 700 from `/fonts/*.woff2`, `font-display: swap`.
   - Brand typography: Geist 600 for headings, 400 for body, nav and CTAs; Hack 700 for labels, badges and counts; Hack 400 for prices.
   - Visible focus rings in CR Orange. Layout fits 375 px wide with no horizontal scroll.

3. **`app/layout.tsx`:** loads Geist via `next/font/google` (weights 400 and 600, latin) and exposes it as a CSS variable; imports `globals.css`; wraps children in the store provider, header and footer; sets `<html lang="en">` and page metadata (title "DeskDrop").

4. **`components/store-provider.tsx`** (client): React context holding a `StoreState` from `lib/store.ts`, starting from `initialState`, in memory only (localStorage arrives in PR 6). It exposes the state, an updater that takes a pure `lib/store` function, and `notify(message)`, which shows the message in a polite live region (`role="status"`). PR 4 builds on this provider.

5. **`components/shell.tsx`** (client): `Header` and `Footer`.
   - **Header:** the DeskDrop wordmark (text in Geist, links to `/`, `aria-label="DeskDrop home"`); desktop nav links "Shop all" (`/`), "Desk essentials" (`/?category=Desk%20essentials`), "New arrivals" (`/?new=1`); a search form (GET to `/`, input `name="q"`, `type="search"`, label "Search products", placeholder "Find your next favorite"); a wishlist link to `/wishlist` with `aria-label="Wishlist, N items"`; an account link to `/account` labeled "My account"; a bag link to `/cart` with `aria-label="Shopping bag, N items"`, where N is the total quantity, shown as a Hack 700 count. **No CodeRabbit mark in the header.**
   - **Mobile (< 768 px):** the desktop nav is hidden; a menu button ("Open menu" / "Close menu", `aria-expanded`) toggles a `nav` labeled "Mobile navigation" with the same links, "My account" and its own search form. Choosing a link closes it.
   - **Footer:** the wordmark, the line "Thoughtful objects. A better place to do your thing.", links "Explore the collection" (`/`) and "Your orders" (`/orders`), the line "Demo storefront · No real payments or deliveries", and the credit: the text "Built with" followed by the logotype image (`alt="CodeRabbit"`), linked to `https://www.coderabbit.ai` with `rel="noopener"`. Use a `<picture>`: `white-typemark.svg` by default and `orange-typemark.svg` under `(prefers-color-scheme: light)`. Height about 20 px, width auto (preserve the aspect ratio), with clear space of at least half its height on every side. No year or other time-dependent text, so page goldens stay stable.

6. **`lib/browse.ts`** (pure, no React) and **`tests/browse.test.mjs`**:
   - `filterProducts(products, { category, query, inStockOnly, newOnly })`: category `"All objects"` matches all. `query` is trimmed and matched case-insensitively against name, subtitle and category; empty matches all. `inStockOnly` keeps `inStock`. `newOnly` keeps `badge === "New arrival"`.
   - `sortProducts(products, sort)` with `"featured"` (catalog order), `"price-low"`, `"price-high"` and `"rating"` (highest first). It never mutates its input, and ties keep catalog order. An unknown sort value falls back to featured.
   - Unit tests cover each filter alone and combined, each sort, immutability, tie order, and an unknown sort value. Because `lib/browse.ts` is new, red-then-green does not apply; the tests judge proves the tests.

7. **`components/product-art.tsx`:** one original inline SVG per `art` value, drawn with art tokens via `currentColor`/`var(--…)`. Mauve backgrounds, orange and accent details. Do not use `product.background` (beige catalog data); do not copy art from anywhere. `aria-hidden="true"`.

8. **`components/product-card.tsx`** (client):
   - Art, name (h3), price via `money()` in Hack 400, subtitle, rating, and a badge if present. An out-of-stock product shows a "Back soon" badge.
   - Color swatches from `product.colors[].hex`, with `title` and an accessible name of the color. These hex values are product data passed as inline style, not theme colors.
   - A save button toggling `toggleWishlist`, `aria-pressed`, label "Save NAME to wishlist" / "Remove NAME from wishlist"; notify "Saved for a little later" / "Removed from your wishlist".
   - In stock: a quick-add button, label "Add NAME to bag", that calls `addItem(state, product, product.colors[0].name, 1)` and notifies "NAME added to your bag". Out of stock: no quick-add; a "View details" link to `/products/<id>` instead.
   - The name and art link to `/products/<id>` (the page arrives in PR 4).

9. **`components/shop.tsx`** (client) and **`app/page.tsx`:**
   - `app/page.tsx` reads `searchParams` (`category`, `q`, `new`). An unknown category becomes "All objects". It renders `Shop`.
   - Hero (only when there is no query and no `new=1`): eyebrow "MAKE SPACE FOR A GOOD DAY", h1 "Your desk. Your little happy place.", line "Thoughtful essentials for the place where your best ideas happen.", primary CTA "Find your desk favorites" linking to `#collection`.
   - Collection section `id="collection"`: heading "A little something for your space.", or `Results for “q”` when searching, or "Fresh on the desk." for new arrivals. The query renders as text only, never as HTML.
   - Category buttons from `categories`, with `aria-pressed`, inside a group labeled "Product categories"; "All objects" shows the product count.
   - A checkbox "In stock only".
   - A select labeled "Sort products" with Featured / Price: low to high / Price: high to low / Top rated. **Changing the sort keeps the chosen category, query and filters.**
   - A results line: "N thoughtful objects" ("1 thoughtful object").
   - A product grid of `ProductCard`s, or an empty state with h3 "No objects found.", the line "Try another search or give your filters a little more room." and a link "Explore all objects" to `/`.
   - All filtering and sorting goes through `lib/browse.ts`.

10. **`app/not-found.tsx`:** eyebrow "404 · A LITTLE OUT OF PLACE", h1 "This one wandered off.", line "Let’s get you back to something good.", link "Back to the collection" to `/`.

11. **Playwright:**
    - `playwright.config.ts`:
      - tests in `tests/e2e/`, Chromium only;
      - a `webServer` that builds and starts the app on a fixed port (for example `npm run build && npx next start -p 3100`), so `npm run test:e2e` works from a clean checkout after `npx playwright install chromium`;
      - `snapshotPathTemplate: "tests/golden/pages/{arg}{ext}"`;
      - `retries: 0`, and `forbidOnly` in CI.
    - `tests/e2e/browse.spec.ts`, journeys at 1280×800 unless stated:
      - search from the header (`lamp`) → URL has `q=lamp`, the heading reads `Results for “lamp”` and only matching cards show;
      - search with no match → the empty state;
      - the query `<b>marker</b>` renders literally as text, with no `b` element created;
      - category "Lighting" → only lighting products, and the results line is correct;
      - "In stock only" hides out-of-stock products;
      - sort "Price: low to high" while "Tech accessories" is selected → the category stays selected and prices ascend;
      - quick-add → the bag label reads "Shopping bag, 1 items" (or the pluralized label you choose; assert it exactly), and the status region announces it;
      - save → the wishlist count updates;
      - `/does-not-exist` → status 404 and the not-found heading;
      - at 375×812: no horizontal scroll (`scrollWidth <= clientWidth`), the menu opens and closes, and the mobile nav links are visible.
    - `tests/e2e/contrast.spec.ts`: for both `colorScheme: "dark"` and `"light"`, read the resolved token values from `:root` and assert WCAG contrast:
      - `--color-text` and `--color-muted` on `--color-bg` and on `--color-surface` ≥ 4.5;
      - `--color-on-primary` on `--color-primary` ≥ 4.5;
      - `--color-link` and `--color-active-text` on `--color-bg` ≥ 4.5;
      - `--color-primary` (focus ring) on `--color-bg` ≥ 3.

      Compute the ratio in the test with the WCAG relative-luminance formula, and print the measured ratios.
    - `tests/e2e/pages.spec.ts`: the page goldens. In the dark scheme at 1280×800, `expect(page.locator("body")).toMatchAriaSnapshot({ name: "home.aria.yml" })` for `/` and `{ name: "not-found.aria.yml" }` for `/does-not-exist`. Generate them with the refresh script below and commit them; never hand-edit them.

12. **`package.json` scripts only:**
    - `"test:e2e": "playwright test"`;
    - `"golden:capture:pages": "playwright test tests/e2e/pages.spec.ts --update-snapshots"`.

    No other change; no dependency change.

13. **`.github/workflows/ci.yml`:** add an `e2e` job matching the others (ubuntu-latest, Node 22, npm cache, `npm ci`), then `npx playwright install --with-deps chromium` and `npm run test:e2e`, `timeout-minutes: 15`. Upload `playwright-report/` as an artifact on failure. Leave the other jobs unchanged.

## Golden changes this PR is allowed to make

- **Add** `tests/golden/pages/home.aria.yml` and `tests/golden/pages/not-found.aria.yml`.
- `tests/golden/domain/**`, `MANIFEST.sha256` and `BASELINE` stay byte-identical. `npm run golden:check` must still print `PASS: 29 goldens match`.

## Security

- The search query is rendered as React text only: no `dangerouslySetInnerHTML`, and no query in `href`s other than the form GET.
- The footer credit link uses `rel="noopener"`. There are no other external requests at runtime (Geist is self-hosted by `next/font` at build).

## CLI review

The orchestrator runs the required CodeRabbit CLI review on the pushed commit. If your task's review is enabled, run `coderabbit review --agent` on your patch too, and list its findings as fixed or skipped. If it's blocked, say so.

## ALLOW

```
ALLOW: app/layout.tsx
ALLOW: app/page.tsx
ALLOW: app/not-found.tsx
ALLOW: app/globals.css
ALLOW: components/*.tsx
ALLOW: lib/browse.ts
ALLOW: tests/browse.test.mjs
ALLOW: tests/e2e/*.spec.ts
ALLOW: playwright.config.ts
ALLOW: public/brand/*.svg
ALLOW: public/fonts/*
ALLOW: tests/golden/pages/*.aria.yml
ALLOW: package.json
ALLOW: .github/workflows/ci.yml
ALLOW: tests/smoke.test.mjs
```

`tests/smoke.test.mjs` has a test pinning the `test:e2e` placeholder ("test:e2e is a successful placeholder until PR 3"). Replace only that test with one asserting `test:e2e` is `playwright test` and `golden:capture:pages` is as above, without spawning Playwright. Leave every other smoke test unchanged.

Do not modify `lib/catalog.ts`, `lib/store.ts`, other existing tests, existing goldens, `scripts/`, `.coderabbit.yaml`, `AGENTS.md` or `docs/`.

## Required checks

- `npm ci && npm run typecheck && npm test && npm run golden:check && npx playwright install chromium && npm run test:e2e && npm run build`;
- `shasum -a 256 public/brand/*.svg public/fonts/*` matches the values above;
- `npm run golden:capture:pages` again leaves `git status` clean (page goldens are deterministic);
- `git diff --stat origin/main -- tests/golden/domain tests/golden/MANIFEST.sha256 tests/golden/BASELINE` is empty;
- `grep -nE '#[0-9a-fA-F]{3,8}\b|rgb\(' app components` finds raw colors only inside the two token blocks of `app/globals.css`.

## Report

Changed files with the file count; the output of each check; the token table per theme with the measured contrast ratios; the e2e journey list; and the CLI review status.
