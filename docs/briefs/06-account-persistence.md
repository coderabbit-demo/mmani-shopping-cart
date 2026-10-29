# Brief 06 — `feat: account, wishlist, persistence, demo reset`

**Mode:** brownfield feature. The domain goldens stay byte-identical. The page goldens change only as named below. **Jira:** SC-9
**Read first:** `docs/PLAN.md` (PR 6 section, cart rule 5, "Visual design"), `docs/BRAND.md` and `AGENTS.md`.

## Assumptions (verified 2026-10-29 on main 66ac095)

- `components/store-provider.tsx` holds `StoreState` in memory, starting from `initialState`. It exposes `{ state, update(transform), notify(message) }`. Nothing reads or writes localStorage yet.
- `lib/store.ts` exports these, unchanged since PR 1:
  - `STORAGE_KEY = "deskdrop-demo-v1"`;
  - `demoAccount` (`alex@deskdrop.demo` / `deskdrop123`, name "Alex Morgan"), commented as fixture-only;
  - `signIn(state, email, password)`, which returns `{ state, error? }`, sets `user` to `{ name, email }` only (never the password), and **keeps the wishlist** (rule 5). Its error is "Those details don't match our demo account.";
  - `signOut(state)`, which keeps the wishlist;
  - `toggleWishlist`;
  - the `StoreState`, `CartItem`, `Order`, `Address` and `Delivery` types.
- `lib/catalog.ts` has `products` and `productById`. A product's colors are `colors[].name`.
- The header links to `/wishlist` and `/account`, which 404 today. The footer (in `components/shell.tsx`) has no "Reset demo" link.
- `/cart`, `/checkout`, `/checkout/success` and `/orders` exist (PR 4 and PR 5) and read state through `useStore()`. `components/checkout.tsx` prefills email and name from `state.user` in its initial `useState`. The header's `/account` and `/wishlist` links carry `prefetch={false}` (PR 5), because those routes didn't exist yet.
- Page goldens in `tests/golden/pages/`: `home`, `not-found`, `product-arc-desk-lamp`, `cart-empty`, `checkout-empty` and `orders-empty`. Every page renders the shared footer.

## Goal

The demo survives a reload: the cart, wishlist, sign-in, orders and the last receipt persist in localStorage under `deskdrop-demo-v1`. If storage is blocked or holds corrupt or hostile data, the app falls back to a clean in-memory state. A shopper can sign in with the fixture account (which keeps the wishlist, rule 5), view the wishlist, and reset the demo.

## Deliverables

1. **`lib/persist.ts`** (pure, no DOM) and **`tests/persist.test.mjs`**:
   - **`parseStoredState(raw: string | null): StoreState`** never throws. It returns `initialState` for `null`, invalid JSON, or a non-object. Otherwise it rebuilds a fresh state field by field, keeping only valid data:
     - **`cart`:** keep a line only if all of these hold:
       - `productId` is a catalog product;
       - `color` is one of that product's colors;
       - `quantity` is an integer from 1 to 10.

       Set `unitPrice` from the catalog, ignoring the stored value. Merge duplicate product+color lines, clamping to 10.
     - **`wishlist`:** unique catalog product ids only.
     - **`user`:** exactly `{ name: demoAccount.name, email: demoAccount.email }` if the stored user matches the demo account's email; otherwise `null`. No other identity can be injected.
     - **`coupon`:** `{ code: "DESK15" }` only if the stored code is `"DESK15"` and the rebuilt cart's subtotal is ≥ $100; otherwise `null`.
     - **`delivery`:** `"express"` or `"standard"`; anything else becomes `"standard"`.
     - **`orders`:** keep an order only if all of these hold, and drop invalid orders one by one:
       - `id` matches `^DD-[A-Z0-9]{8}$`;
       - `createdAt` parses as a date;
       - it has at least one item, each valid as a cart line (product, color, integer quantity 1–10, finite `unitPrice` ≥ 0);
       - `subtotal`, `discount`, `shipping` and `total` are finite and ≥ 0;
       - `delivery` is valid;
       - `address` has six string fields within the checkout `maxLength`s (email 254, name 100, street 200, city 100, postal 20, country 100).

       Keep at most 50 orders.
     - **`lastOrder`:** a valid order or `null`.
     - **`notice`:** always `null`.

     Copy only the known keys. Never spread parsed objects, so `__proto__`, `constructor` and extra keys are dropped.
   - **`serializeState(state): string`:** `JSON.stringify` of exactly the fields above. `notice` is omitted.
   - **Unit tests:**
     - corrupt JSON;
     - `null`, arrays, numbers and strings;
     - each invalid cart field;
     - an unknown product id;
     - a tampered `unitPrice`, which is reset from the catalog;
     - duplicate lines merged;
     - a foreign user (`{ name: "Mallory", email: "x@y.z" }` becomes `null`);
     - a coupon below $100 dropped;
     - a bad delivery value;
     - invalid orders dropped individually while valid ones are kept;
     - an over-long address field;
     - a `__proto__` payload that doesn't pollute `Object.prototype`;
     - round trip: `parseStoredState(serializeState(s))` deep-equals `s` for a realistic state with cart, wishlist, user, coupon, express delivery, two orders and a `lastOrder`.

2. **`components/store-provider.tsx`:**
   - On mount, read `localStorage.getItem(STORAGE_KEY)` inside `try`, then `parseStoredState`. Any thrown access falls back to memory. Then set `ready = true`.
   - After `ready`, write `serializeState(state)` on every change, inside `try`. A failed write keeps the app working in memory. Never log.
   - Expose `ready` and `reset()`. `reset()` sets `initialState`, removes the key inside `try`, and notifies "Fresh start. Your demo has been reset."
   - The existing API (`state`, `update`, `notify`) is unchanged.

3. **State-dependent pages wait for `ready`:**
   - `/cart`, `/checkout`, `/checkout/success`, `/orders`, `/wishlist` and `/account` render a short loading line ("Getting things ready…") until `ready`. After a reload they then show the stored state, not a flash of the empty state.
   - Their markup after `ready` is unchanged.

4. **`app/account/page.tsx`** and **`components/account.tsx`** (client):
   - **Signed out:**
     - eyebrow "WELCOME TO YOUR LITTLE CORNER"; h2 "Make yourself at home.";
     - a form with labeled "Email address" (`autoComplete="username"`) and "Password" (`type="password"`, `autoComplete="current-password"`);
     - submit "Sign in" calls `signIn`, showing its error in `role="alert"`;
     - a box "TAKE THE DEMO FOR A SPIN" showing the demo email and password in Hack, with the line "Demo account only. Use these sample credentials. This is not real authentication."
   - **On success:**
     - notify "Welcome back, Alex. Make yourself at home.";
     - if `?next=` is exactly `wishlist` or `checkout`, `router.push` to `/wishlist` or `/checkout`. Ignore any other value (no open redirect).
   - **Signed in:**
     - eyebrow "YOUR OWN LITTLE CORNER"; h1 "Good to see you, Alex."; the email;
     - links "Your orders" (`/orders`), "Your wishlist" (`/wishlist`) and "Reset demo" (`/demo`);
     - a "Sign out" button that calls `signOut` and notifies "You’ve signed out. See you soon."

5. **`app/wishlist/page.tsx`** (client):
   - eyebrow "FOR NOW. FOR LATER. FOR YOU."; h1 "Your little wishlist."
   - Saved products as `ProductCard`s, in wishlist order.
   - When signed out with saved items: "Keep your favorites close. Sign in to your account." with a link to `/account?next=wishlist`.
   - Empty: "Save a little inspiration." and "Tap the heart on anything you love. You’ll find it right here."

6. **`app/demo/page.tsx`** (client):
   - eyebrow "A FRESH START"; h1 "Make room for another good day."; the line "Clear your bag, wishlist, account, coupons, and orders from this browser."
   - A "Reset demo" button reveals the confirm prompt "Clear all demo data in this browser?" with "Yes, start fresh" (calls `reset()`) and "Keep my data" (cancel).
   - A link "Back to the storefront" to `/`.

7. **`components/shell.tsx`:** add one footer link "Reset demo" to `/demo`, after "Your orders". Remove the `prefetch={false}` that PR 5 put on the `/account` and `/wishlist` header links, because those routes now exist. Nothing else changes.

8. **`components/checkout.tsx`:** when signed out and the bag isn't empty, show "Already part of the desk club? Sign in" above the form, linking to `/account?next=checkout`. Nothing else changes.

9. **`app/globals.css`:** styles for the account, wishlist, demo and loading states, using tokens only.

10. **Playwright:**
    - **`tests/e2e/account.spec.ts`:**
      - **rule 5:** signed out, save the lamp and keyboard → wishlist count 2. Sign in with the demo account → the count is still 2, and `/wishlist` lists both. Sign out → still 2;
      - **wrong password:** shows "Those details don't match our demo account.", and the user stays signed out;
      - **`?next=`:** `/account?next=wishlist` lands on `/wishlist` after sign-in. `/account?next=https://example.test` and `?next=//example.test` stay on `/account`;
      - **checkout prompt:** signed out with an item, `/checkout` shows the sign-in prompt. After signing in from it, email and name are prefilled;
      - **password never stored:** after sign-in, the raw `localStorage` value contains no `deskdrop123`.
    - **`tests/e2e/persistence.spec.ts`:**
      - **reload keeps the cart:** add Sage lamp ×2 → `page.reload()` → `/cart` still shows Sage ×2 and the bag count 2;
      - **reload keeps the receipt and orders:** place an express order → reload `/checkout/success` → the same order id and the $12 shipping; reload `/orders` → the order is listed;
      - **reset:** with a cart, wishlist, user and orders, `/demo` → "Reset demo" → "Yes, start fresh" → counts 0, `/orders` empty, `/account` signed out, and the storage key absent. "Keep my data" changes nothing;
      - **storage disabled:** with an `addInitScript` that makes `window.localStorage` throw on access, the shopper can add to the bag, check out and see the receipt. No uncaught page errors (`page.on("pageerror")` collects nothing);
      - **corrupt storage:** with the key pre-set to `{bad json` → the app loads empty, without errors. Pre-set to a hostile object (unknown product id, quantity 999, foreign user, an order with an `<img src=x onerror=alert(1)>` name and a bad id) → the app loads, drops the invalid parts, keeps any valid line, and creates no `img` element from the payload;
      - **no flash after reload:** the cart page never shows "Room for something good." while a stored cart is loading (check the first painted content after reload).
    - **`tests/e2e/pages.spec.ts`:** add `account-signed-out.aria.yml` (`/account`), `wishlist-empty.aria.yml` (`/wishlist`) and `demo.aria.yml` (`/demo`).

## Golden changes this PR is allowed to make

- **Add:** `account-signed-out.aria.yml`, `wishlist-empty.aria.yml` and `demo.aria.yml`.
- **Change**, only by the one added footer link "Reset demo" (`/url: /demo`): `home`, `not-found`, `product-arc-desk-lamp`, `cart-empty`, `checkout-empty` and `orders-empty`. Show `git diff tests/golden/pages` in the report; any other difference in those files is out of scope.
- The domain goldens, `MANIFEST.sha256` and `BASELINE` stay byte-identical.

## Red-then-green

`tests/persist.test.mjs` and `lib/persist.ts` are new, so the tests judge proves them by mutation. `account.spec.ts` and `persistence.spec.ts` must fail on main (no routes, no persistence) and pass on your head; show it.

## Security

- Demo credentials are labeled fixture-only, and the UI makes no real authentication claims.
- The password is never stored or logged.
- `?next=` is an exact allow-list.
- Stored data is untrusted input. It's parsed defensively, rendered as React text only, and can't inject a user, prices or prototype keys.
- No `console` calls in app code.

## CLI review

The orchestrator runs the required CodeRabbit CLI review on the pushed commit. If your task's review is enabled, run `coderabbit review --agent` on your patch too, and list its findings as fixed or skipped. If it's blocked, say so.

## ALLOW

```
ALLOW: lib/persist.ts
ALLOW: tests/persist.test.mjs
ALLOW: components/store-provider.tsx
ALLOW: components/account.tsx
ALLOW: components/shell.tsx
ALLOW: components/checkout.tsx
ALLOW: components/cart.tsx
ALLOW: app/account/page.tsx
ALLOW: app/wishlist/page.tsx
ALLOW: app/demo/page.tsx
ALLOW: app/checkout/success/page.tsx
ALLOW: app/orders/page.tsx
ALLOW: app/globals.css
ALLOW: tests/e2e/account.spec.ts
ALLOW: tests/e2e/persistence.spec.ts
ALLOW: tests/e2e/pages.spec.ts
ALLOW: tests/e2e/checkout.spec.ts
ALLOW: tests/golden/pages/*.aria.yml
```

`components/cart.tsx`, `components/checkout.tsx`, `app/checkout/success/page.tsx` and `app/orders/page.tsx` may change only for the `ready` gate, plus the checkout sign-in prompt. In `tests/e2e/checkout.spec.ts`, change only the assertion (and its title) that localStorage is empty after checkout. Assert instead that localStorage holds only the `deskdrop-demo-v1` key with the placed order, no password, and that sessionStorage is empty. Keep the URL, console, marker and double-submit assertions. Do not modify `lib/store.ts`, `lib/catalog.ts`, other existing tests, `package.json`, CI, `scripts/` or `docs/`.

## Required checks

- `npm ci && npm run typecheck && npm test && npm run golden:check && npm run test:e2e && npm run build`;
- `npm run golden:capture:pages` again leaves `git status` clean;
- `git diff origin/main -- tests/golden/pages` shows only the added footer link plus the three new files;
- `git diff --stat origin/main -- tests/golden/domain tests/golden/MANIFEST.sha256 tests/golden/BASELINE` is empty;
- `grep -rnE '#[0-9a-fA-F]{3,8}\b|rgb\(' components app --include='*.tsx'` and `grep -rn 'console\.' app components lib` find nothing.

## Report

Changed files with the count; the output of each check; the page-golden diff; red-on-main evidence; the unit and e2e test lists; and the CLI review status.
