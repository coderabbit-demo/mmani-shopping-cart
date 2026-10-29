# Brief 04 — `feat: product detail + cart page`

**Mode:** brownfield feature. The domain goldens stay byte-identical; this PR adds page goldens. **Jira:** SC-7
**Read first:** `docs/PLAN.md` (PR 4 section, cart rules 1–3, "Visual design"), `docs/BRAND.md` and `AGENTS.md`.

## Assumptions (verified 2026-10-28 on main fc8f33f)

- `components/store-provider.tsx` exports `StoreProvider` and `useStore()`, which returns `{ state, update(transform), notify(message) }`. `update` takes a pure `(state) => state` function, and `notify` shows a toast that clears after 4 seconds.
- `lib/store.ts` (unchanged since PR 1) has these exports:
  - `addItem(state, product, color, quantity)` throws `RangeError` for an out-of-stock product or unknown color, merges the same product+color into one line, and clamps quantity to 1–10.
  - `changeQuantity(state, productId, color, quantity)` and `removeItem(state, productId, color)` are keyed by product **and** color.
  - Every cart change recomputes the coupon: below a $100 subtotal it clears `coupon` and sets `state.notice` to "DESK15 was removed because your subtotal dropped below $100." The next cart change clears the notice.
  - `applyCoupon(state, code)` returns `{ state, error? }`. The errors are "That code isn't valid." and "DESK15 needs a subtotal of at least $100."
  - `removeCoupon(state)`, `lineTotal(item)`, `totals(state)` → `{ subtotal, discount, shipping, total }` in dollars. `shipping` is 0 for standard and 12 for express, from `state.delivery`, which defaults to standard.
- `lib/catalog.ts` has `productById(id)` and `money(value)`. Prices: arc-desk-lamp 68 (Terracotta/Sage/Cream), form-mechanical-keyboard 94, tidy-desk-organizer 32, little-green-companion 24, slow-time-clock 42 (out of stock).
- `components/product-card.tsx` already links each product to `/products/<id>`, and `components/shell.tsx` links the bag to `/cart`. Both 404 today.
- `components/product-art.tsx` exports `ProductArt({ art })`. `lib/browse.ts` exports `swatchToken(name)`, which returns `var(--swatch-<slug>)`.
- Playwright reads `PLAYWRIGHT_PORT`, which defaults to 3100. `snapshotPathTemplate` is `tests/golden/pages/{arg}{ext}`. `npm run golden:capture:pages` runs `tests/e2e/pages.spec.ts` with `--update-snapshots`.
- `tests/golden/pages/` holds `home.aria.yml` and `not-found.aria.yml`. They must stay unchanged unless the shell changes, and this brief doesn't change the shell.

## Goal

A shopper can open a product, choose a color and quantity, add it to the bag, and manage the bag: change quantities, remove lines, and apply or remove DESK15. Totals always follow cart rules 1–3. Shipping shows the real delivery choice, never a hard-coded "free".

## Deliverables

1. **`app/products/[slug]/page.tsx`** (server):
   - `generateStaticParams` covers all products;
   - `generateMetadata` sets the title to the product name;
   - an unknown slug calls `notFound()`;
   - renders `ProductDetail`.

2. **`components/product-detail.tsx`** (client):
   - **Breadcrumb**: Home › The collection (`/#collection`) › product name, with `aria-current="page"`.
   - **Product info**: art; the category eyebrow; h1 name; subtitle; rating; price via `money()` in Hack 400; description; and the details list under "The thoughtful details".
   - **Color selector**: a `fieldset` with legend "Color", plus the chosen color name. One button per color, labeled "Select NAME", with `aria-pressed`, and the swatch from `swatchToken`. The default is the first color.
   - **Quantity**: the shared `Quantity` control, starting at 1.
   - **Add to bag**: calls `addItem` with the chosen color and quantity, and notifies "NAME added to your bag". After adding, show a link "In your bag. Take a look" to `/cart`.
   - **Out of stock**: the add button is disabled, reads "Back soon", and the stock note reads "Taking a little break. Check back soon." In stock, the note reads "In stock and ready for your desk".
   - **Wishlist**: a save toggle, "Save to wishlist" / "Remove from wishlist", with `aria-pressed`, using `toggleWishlist`.
   - **Related products**: "A few more desk companions." with up to 4 other products as `ProductCard`s.

3. **`components/commerce.tsx`**, shared building blocks:
   - **`Breadcrumb`.**
   - **`Quantity({ value, onChange, label })`**: buttons labeled "Decrease quantity of LABEL" and "Increase quantity of LABEL", disabled at 1 and 10, with the value shown in Hack between them.
   - **`OrderSummary`**:
     - "Subtotal".
     - "Shipping": "Free" for standard, otherwise `money(12)` labeled "Express".
     - When a coupon is applied, a "DESK15 (15% off)" line with `−money(discount)`.
     - "Total", in Hack 400 for the amounts and Hack 700 for the labels.
     - Each amount carries a `data-testid`: `subtotal`, `shipping`, `discount`, `total`.
     - All values come from `totals(state)`.

4. **`app/cart/page.tsx`** and **`components/cart.tsx`** (client):
   - **Heading:** "Your bag" with the total quantity.
   - **Empty bag:** "Room for something good." and "Your bag is empty. Let’s find something that feels like you.", with a link "Find your next favorite" to `/`.
   - **One line per product+color** (key `productId:color`), showing:
     - art and name, linked to the product;
     - **the line's color**;
     - unit price;
     - a `Quantity` control calling `changeQuantity(state, productId, color, q)`;
     - the line total via `lineTotal`;
     - a remove button "Remove NAME (COLOR)" calling `removeItem(state, productId, color)`, notifying "NAME removed from your bag".
   - **Coupon form:**
     - a labeled input "Discount code";
     - "Apply" calls `applyCoupon`, showing its error in `role="alert"` or, on success, notifying "A little treat: 15% off applied.";
     - when applied, shows "DESK15 applied" with a "Remove coupon" button that calls `removeCoupon`.
   - **`state.notice`:** when set (the DESK15 removal), show it in a visible `role="status"` message in the cart.
   - **Summary:** `OrderSummary`, then a link "On to checkout" to `/checkout` (that page arrives in PR 5), and the line "Simulated checkout. No payment required."

5. **`app/globals.css`:** styles for the detail page, cart, quantity control, summary and breadcrumb, using the existing tokens only. Add new tokens to the token blocks if needed. Layout fits 375 px with no horizontal scroll.

6. **Playwright:**
   - `tests/e2e/cart.spec.ts`, journeys:
     - **rule 1:** on `/products/arc-desk-lamp`, select Sage, add → `/cart` shows one line "Sage". Go back, add Terracotta → two lines (Sage, Terracotta), and the bag count is 2;
     - **rule 2:** lamp quantity 1 → 3 with "Increase" → the line total reads $204.00 and the subtotal reads $204.00. At 10, "Increase" is disabled; at 1, "Decrease" is disabled;
     - **rule 2, per line:** with two colors of the lamp, changing one line's quantity leaves the other line unchanged;
     - **rule 3:** lamp + tidy-desk-organizer ($100.00), apply `desk15` (lowercase) → discount −$15.00, total $85.00. Remove the organizer → the coupon is gone, the notice "DESK15 was removed because your subtotal dropped below $100." is visible, and the total is $68.00;
     - **coupon errors:** `NOPE` shows "That code isn't valid."; DESK15 on a $68 bag shows "DESK15 needs a subtotal of at least $100.";
     - **remove coupon:** applied, then "Remove coupon" → no discount line, and the total equals the subtotal;
     - **shipping:** the summary shows "Free" with standard delivery (express arrives with checkout in PR 5);
     - **empty bag:** the empty state, with the link back to `/`;
     - **out of stock:** `/products/slow-time-clock` has a disabled "Back soon" button;
     - **unknown slug:** `/products/nope` → status 404 and the not-found heading;
     - **375×812:** detail and cart pages have no horizontal scroll.
   - `tests/e2e/pages.spec.ts`: add page goldens `product-arc-desk-lamp.aria.yml` (`/products/arc-desk-lamp`) and `cart-empty.aria.yml` (`/cart`), with the same viewport and scheme as the existing ones. Generate them with `npm run golden:capture:pages` and never hand-edit them.

## Golden changes this PR is allowed to make

- **Add** `tests/golden/pages/product-arc-desk-lamp.aria.yml` and `tests/golden/pages/cart-empty.aria.yml`.
- `home.aria.yml` and `not-found.aria.yml` stay unchanged. If either changes, stop and explain why.
- The domain goldens, `MANIFEST.sha256` and `BASELINE` stay byte-identical.

## Red-then-green

`tests/e2e/cart.spec.ts` is new, but it exercises routes that 404 on main. Show that it fails on main (the PR 3 merge) and passes on your head. `lib/` is unchanged.

## CLI review

The orchestrator runs the required CodeRabbit CLI review on the pushed commit. If your task's review is enabled, run `coderabbit review --agent` on your patch too, and list its findings as fixed or skipped. If it's blocked, say so.

## ALLOW

```
ALLOW: app/products/*/page.tsx
ALLOW: app/cart/page.tsx
ALLOW: components/product-detail.tsx
ALLOW: components/commerce.tsx
ALLOW: components/cart.tsx
ALLOW: components/product-card.tsx
ALLOW: app/globals.css
ALLOW: tests/e2e/cart.spec.ts
ALLOW: tests/e2e/pages.spec.ts
ALLOW: tests/golden/pages/product-arc-desk-lamp.aria.yml
ALLOW: tests/golden/pages/cart-empty.aria.yml
```

`components/product-card.tsx` is allowed only for reusing a shared piece from `commerce.tsx`; do not change its behavior. Do not modify `lib/`, other existing tests or goldens, `package.json`, CI, `scripts/` or `docs/`.

## Required checks

- `npm ci && npm run typecheck && npm test && npm run golden:check && npm run test:e2e && npm run build`;
- `npm run golden:capture:pages` again leaves `git status` clean;
- `git diff --stat origin/main -- tests/golden/domain tests/golden/MANIFEST.sha256 tests/golden/BASELINE tests/golden/pages/home.aria.yml tests/golden/pages/not-found.aria.yml` is empty;
- `grep -rnE '#[0-9a-fA-F]{3,8}\b|rgb\(' components app --include=*.tsx` finds nothing.

## Report

Changed files with the count; the output of each check; red-on-main evidence for `cart.spec.ts`; the e2e journey list; and the CLI review status.
