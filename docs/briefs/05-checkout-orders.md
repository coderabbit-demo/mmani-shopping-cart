# Brief 05 — `feat: checkout, receipt, orders`

**Mode:** brownfield feature. The domain goldens stay byte-identical; this PR adds page goldens. **Jira:** SC-8
**Read first:** `docs/PLAN.md` (PR 5 section, cart rules 4 and 6, "Visual design"), `docs/BRAND.md` and `AGENTS.md`.

## Assumptions (verified 2026-10-28 on main 7f64bca)

- `useStore()` (`components/store-provider.tsx`) returns `{ state, update(transform), notify(message) }`, holding state in memory. Client-side navigation (`next/link`, `next/form`, `router.push`) keeps it; a full reload resets it until PR 6.
- `lib/store.ts`:
  - `setDelivery(state, "standard" | "express")`.
  - `totals(state)` gives `shipping` = 0 or 12 from `state.delivery`.
  - `placeOrder(state, address, id, createdAt)`:
    - throws on an empty cart;
    - copies every cart line (product **and** color) into `order.items`;
    - stores `subtotal`, `discount`, `shipping`, `total`, `delivery` and `address`;
    - prepends the order to `state.orders`;
    - sets `state.lastOrder`;
    - resets the cart, coupon and delivery.
  - `Address` is `{ name, email, street, city, postal, country }`.
- `components/commerce.tsx` (PR 4) exports:
  - `Breadcrumb({ items: { label, href? }[] })`, where the last item has no `href` and gets `aria-current="page"`;
  - `Quantity({ value, onChange, label })`;
  - `OrderSummary({ state })`, which renders Subtotal, Shipping ("Free" or `money(12)`), the DESK15 discount and Total from `totals(state)`, with `data-testid` `subtotal`, `shipping`, `discount` and `total`.
- `/cart` (`components/cart.tsx`) shows "Checkout opens in the next update." under the summary instead of a checkout link, because `/checkout` didn't exist yet (PR 4 fix round 2).
- `money()` prints whole dollars without cents (`$68`, `$12`), and keeps cents otherwise (`$24.30`).
- Playwright reads `PLAYWRIGHT_PORT`. Page goldens are written by `npm run golden:capture:pages` to `tests/golden/pages/`.

## Goal

A shopper can check out with a validated address, choose standard or express delivery, place a simulated order, see a receipt, and find every order in full under `/orders`. Express shipping appears in the checkout, receipt and order totals (rule 4), and every ordered line is kept, including two colors of one product (rule 6).

## Deliverables

1. **`app/checkout/page.tsx`** and **`components/checkout.tsx`** (client):
   - **Breadcrumb:** Home › Your bag (`/cart`) › Checkout.
   - **Heading:** eyebrow "ALMOST AT YOUR DESK", h1 "Make it yours.", line "Just a few details, and we’ll take it from here."
   - **Empty bag:** "Your bag needs a little something." and "Add an object to your bag before checking out.", with a link back to `/`.
   - **Form** (`noValidate`, so the app's own validation runs and renders), with sections:
     1. "Your details": Email address and Full name;
     2. "Your happy place": Street address, City, ZIP / postal code, and Country (a select with United States, United Kingdom, Canada, India, Australia; default United States);
     3. "The journey to you": radio options "Standard delivery · 4–6 business days · Free" and "Express delivery · 1–2 business days · $12". **Changing the option calls `setDelivery`**, so the summary's shipping and total update immediately;
     4. "A practice payment": a static "Demo payment •••• 4242" note, "This is a test store. No card details or real payment needed." There are no card inputs.
   - Each input has a visible `<label>`, `autoComplete`, and `maxLength` (email 254, name 100, street 200, city 100, postal 20). If the shopper is signed in, prefill email and name from `state.user`.
   - **Validation on submit,** with values trimmed:
     - each field is required and not whitespace-only;
     - email must match a simple `local@domain.tld` shape.

     On error:
     - do not place the order;
     - set `aria-invalid="true"` and link an error message via `aria-describedby` on each bad field ("Enter your email address.", "Enter a valid email address.", "Enter your full name.", "Enter your street address.", "Enter your city.", "Enter your ZIP or postal code.");
     - move focus to the first invalid field.
   - **Summary:** the shared order summary, with the cart lines (name, color, quantity, line total), then "Your details stay in this browser. Use a fictional address for your demo." and a submit button "Place demo order".
   - **On valid submit:**
     - guard against double submit;
     - `id = "DD-" + 8 uppercase characters from crypto.randomUUID()`, `createdAt = new Date().toISOString()`;
     - `update(s => placeOrder(s, address, id, createdAt))`;
     - then `router.push("/checkout/success")`.

     **No form data goes in the URL, and nothing is logged.**

2. **`app/checkout/success/page.tsx`** (client):
   - With no `state.lastOrder`: "Nothing on its way just yet." and a link to `/`.
   - Otherwise: eyebrow "A GOOD DAY JUST GOT BETTER", h1 "Your desk says thanks.", "Order confirmed, FIRSTNAME. Your new favorites are one step closer.", "Demo order only · No payment taken, no email sent.", the `OrderReceipt` (confirmation), and links "View order history" (`/orders`) and "Keep exploring" (`/`).

3. **`components/receipt.tsx`, `OrderReceipt({ order, confirmation })`:**
   - **Header:** "ORDER " plus the id (in Hack); the date formatted `en-US` (`month: "long", day: "numeric", year: "numeric"`, `timeZone: "UTC"`); and the status "Confirmed" or "Processing".
   - **One row per order item,** keyed `productId:color`: the product name (linked), "COLOR · Qty N", and `money(lineTotal(item))`.
   - **"DELIVER TO":** name, street, city, postal and country, each rendered as **React text only**.
   - **"DELIVERY":** "Express · 1–2 business days" or "Standard · 4–6 business days", plus the email.
   - **Totals:** Subtotal; Discount (only if > 0, as `−money`); Shipping ("Free" when 0, else `money`); Total. Each amount carries a `data-testid`: `receipt-subtotal`, `receipt-discount`, `receipt-shipping`, `receipt-total`.

4. **`app/orders/page.tsx`** (client):
   - Breadcrumb Home › Your orders; eyebrow "GOOD THINGS, ON THEIR WAY"; h1 "Your orders."
   - With no orders: "Your story starts here." and a link to `/`.
   - Otherwise one `OrderReceipt` per order, newest first.

5. **`components/cart.tsx`:** replace "Checkout opens in the next update." with a link "On to checkout" to `/checkout`. Change nothing else in the cart. Update the PR 4 e2e test that asserts no checkout link, so it asserts the link instead.

6. **`app/globals.css`:** styles for the checkout form (sections, field errors with `aria-invalid` states), the delivery options, the receipt and orders, using tokens only. Errors use a new `--color-danger` token per theme with text contrast ≥ 4.5:1. Layout fits 375 px.

7. **Playwright** (`tests/e2e/checkout.spec.ts`), journeys:
   - **rule 4:** bag with the lamp ($68). At checkout, the summary shipping reads "Free" and the total $68. Choose Express → shipping $12, total $80. Place the order → the receipt shipping is $12 and the total $80, and `/orders` shows the same;
   - **rule 4 with coupon:** lamp + organizer ($100), apply DESK15 in the cart, express at checkout → discount −$15, shipping $12, total $97 in the summary, receipt and orders;
   - **rule 6:** lamp in Sage and Terracotta, plus the keyboard, ordered → the receipt and `/orders` list all three lines with their colors and quantities. Place a second order → `/orders` lists both, newest first, each complete;
   - **validation:** submitting an empty form shows the five required-field messages (Country has a default), focuses Email, keeps the URL at `/checkout`, and creates no order. A whitespace-only name and a bad email each show their message;
   - **after the order:** the bag count is 0, and `/checkout` shows the empty-bag state;
   - **the URL never carries form data:** after placing an order, `page.url()` has no `?` and no field value. No console messages are emitted during checkout (`page.on("console")` collects nothing);
   - **benign markers render as text:** name `<b>marker</b>` and street `<i>x</i>` appear literally on the receipt and on `/orders`, and no `b` or `i` element is created from them;
   - **direct visit:** `/checkout/success` with no order shows "Nothing on its way just yet.";
   - **375×812:** checkout and orders have no horizontal scroll.
   - `tests/e2e/pages.spec.ts`: add page goldens `checkout-empty.aria.yml` (`/checkout`) and `orders-empty.aria.yml` (`/orders`).

## Golden changes this PR is allowed to make

- **Add** `tests/golden/pages/checkout-empty.aria.yml` and `tests/golden/pages/orders-empty.aria.yml`.
- Existing page goldens stay unchanged. If any changes, stop and explain why.
- The domain goldens, `MANIFEST.sha256` and `BASELINE` stay byte-identical.

## Red-then-green

`tests/e2e/checkout.spec.ts` is new, but it exercises routes that 404 on main. Show that it fails on main and passes on your head.

## Security

Form input is rendered as React text only: no `dangerouslySetInnerHTML` and no HTML parsing. No PII goes in URLs, `console` or storage beyond the in-memory state (localStorage is PR 6). Attack-path tests use benign markers only.

## CLI review

The orchestrator runs the required CodeRabbit CLI review on the pushed commit. If your task's review is enabled, run `coderabbit review --agent` on your patch too, and list its findings as fixed or skipped. If it's blocked, say so.

## ALLOW

```
ALLOW: app/checkout/page.tsx
ALLOW: app/checkout/success/page.tsx
ALLOW: app/orders/page.tsx
ALLOW: components/checkout.tsx
ALLOW: components/receipt.tsx
ALLOW: components/commerce.tsx
ALLOW: components/cart.tsx
ALLOW: tests/e2e/cart.spec.ts
ALLOW: app/globals.css
ALLOW: tests/e2e/checkout.spec.ts
ALLOW: tests/e2e/pages.spec.ts
ALLOW: tests/golden/pages/checkout-empty.aria.yml
ALLOW: tests/golden/pages/orders-empty.aria.yml
```

`components/commerce.tsx` may only gain an optional prop to show the cart lines in the summary; its existing behavior stays. In `tests/e2e/cart.spec.ts`, change only the checkout-link assertion. Do not modify `lib/`, other existing tests or goldens, `package.json`, CI, `scripts/` or `docs/`.

## Required checks

- `npm ci && npm run typecheck && npm test && npm run golden:check && npm run test:e2e && npm run build`;
- `npm run golden:capture:pages` again leaves `git status` clean;
- `git diff --stat origin/main -- tests/golden/domain tests/golden/MANIFEST.sha256 tests/golden/BASELINE` is empty, and no existing page golden changed;
- `grep -rnE '#[0-9a-fA-F]{3,8}\b|rgb\(' components app --include=*.tsx` finds nothing;
- `grep -rn 'console\.' app components` finds nothing.

## Report

Changed files with the count; the output of each check; red-on-main evidence; the e2e journey list; and the CLI review status.
