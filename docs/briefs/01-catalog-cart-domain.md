# Brief 01 — `feat: catalog + cart domain`

**Mode:** greenfield feature, no UI. **Jira:** SC-4
**Read first:** `docs/PLAN.md`, especially "Build to the spec, not the reference code" (cart rules 1–6), and `AGENTS.md`.

## Assumptions (verified 2026-10-28)

- `npm test` runs `node --experimental-strip-types --test tests/*.test.mjs`. Tests in `.mjs` can import `../lib/*.ts` with the `.ts` extension. Checked on Node 24.13, and CI runs Node 22 (strip-types is available from 22.6).
- `tsc --noEmit` (TypeScript 7.0.2, `moduleResolution: bundler`, no `allowImportingTsExtensions`) **rejects value imports that end in `.ts`** (TS5097) and accepts extensionless **type-only** imports. Node strip-types erases type-only imports. So `lib/` files may import each other's **types only**, without an extension (`import type { Product } from "./catalog"`). There are no value imports between `lib/` files; `store.ts` takes products as arguments. Do not change `tsconfig.json`.
- The brand rule against raw hex colors applies to `app/**/*.css` and `components/**`. Product swatch colors in `lib/catalog.ts` are catalog data and may be hex.
- The catalog data in the appendix was copied from the reference repo's `lib/catalog.ts` (8 products). The reference `lib/store.ts` is **not** a source; do not look it up.

## Goal

Pure, immutable catalog and cart logic that later UI PRs build on. Every cart rule in `docs/PLAN.md` must be proved by a unit test.

## Deliverables

### 1. `lib/catalog.ts`

- Types:
  - `Category` = "All objects" | "Desk essentials" | "Lighting" | "Tech accessories" | "Little extras";
  - `Art` = "lamp" | "keyboard" | "headphones" | "plant" | "stand" | "mat" | "organizer" | "clock";
  - `Product` = `{ id, name, subtitle, description, price, category, art, background, colors: { name, hex }[], badge?, rating, details: string[], inStock }`.
- `categories: Category[]`, in the order above.
- `products: Product[]`: exactly the 8 products in the appendix, in order, with every field verbatim.
- `productById(id)` returns the product or `undefined`.
- `money(value)` formats USD with `Intl.NumberFormat("en-US")`: no cents for whole dollars, two decimals otherwise. For example, `money(68)` is "$68" and `money(24.3)` is "$24.30".

### 2. `lib/store.ts`

Pure functions only. Every function returns a new state and never mutates its input, including nested arrays and objects.

- **State:**
  - `CartItem = { productId, color, quantity, unitPrice }`. There is **no stored line total**.
  - `Delivery = "standard" | "express"`.
  - `Order = { id, createdAt, items: CartItem[], subtotal, discount, shipping, total, delivery, address }`.
  - `Address = { name, email, street, city, postal, country }`.
  - `StoreState = { cart, wishlist: string[], user: { name, email } | null, coupon: { code: "DESK15" } | null, delivery, orders: Order[], lastOrder: Order | null, notice: string | null }`.
  - `initialState`, with `delivery: "standard"`.
  - `STORAGE_KEY = "deskdrop-demo-v1"`.
  - `demoAccount = { email: "alex@deskdrop.demo", password: "deskdrop123", name: "Alex Morgan" }`. These are fixture-only demo credentials; label them as such in a short comment.
- **Line identity is (productId, color).**
  - `addItem(state, product, color, quantity)`:
    - throws `RangeError` if `color` is not one of the product's color names, or if the product is out of stock;
    - merges into the existing line with the same product and color, otherwise appends a line;
    - clamps the resulting quantity to 1–10.
  - `changeQuantity(state, productId, color, quantity)` clamps the quantity to 1–10.
  - `removeItem(state, productId, color)`.
- `lineTotal(item)` = unitPrice × quantity. `subtotal(state)` is the sum of line totals.
- **Coupon:**
  - `applyCoupon(state, code)` returns `{ state, error? }`. It trims and ignores case.
    - An unknown code gives the error "That code isn't valid."
    - A subtotal under $100 gives the error "DESK15 needs a subtotal of at least $100."
    - Otherwise it sets `coupon: { code: "DESK15" }`.
  - `removeCoupon(state)`.
  - The discount is **never stored**. `totals()` computes it from the current subtotal.
  - After any cart change (add, change quantity, remove) leaves a coupon applied with a subtotal under $100, the change also sets `coupon: null` and `notice: "DESK15 was removed because your subtotal dropped below $100."` Any other cart change sets `notice: null`.
- `setDelivery(state, delivery)`.
- `totals(state)` returns `{ subtotal, discount, shipping, total }`:
  - discount = coupon present and subtotal ≥ 100 ? round to cents(subtotal × 0.15) : 0;
  - shipping = express ? 12 : 0;
  - total = subtotal − discount + shipping, rounded to cents.
- **Account:**
  - `signIn(state, email, password)` returns `{ state, error? }`. The email is trimmed and case-insensitive. Wrong details give the error "Those details don't match our demo account." On success it sets `user` and keeps the wishlist and cart.
  - `signOut(state)` clears `user` only.
- `toggleWishlist(state, productId)`.
- **Orders:**
  - `placeOrder(state, address, id, createdAt)` throws on an empty cart.
  - The order holds deep copies of **every** cart line, the current totals and the delivery choice.
  - It sets `lastOrder` and prepends the full order to `orders`.
  - It clears the cart and coupon, resets delivery to "standard" and clears `notice`.

### 3. `tests/store.test.mjs`

Name each rule test after its rule, for example "rule 1: ...". The tests must cover:

- **Catalog integrity:**
  - 8 products with unique IDs;
  - positive prices;
  - at least one color each;
  - exactly one out of stock (`slow-time-clock`);
  - `productById`;
  - `money` for whole and fractional values.
- **Rule 1:** the same product in two colors makes two lines. Adding the same product and color again merges. An invalid color throws.
- **Rule 2:** changing quantity recomputes the line total and the subtotal, and the clamp holds at 0 → 1 and 11 → 10.
- **Rule 3:**
  - lamp + keyboard (subtotal 162) with DESK15 → discount 24.30, total 137.70;
  - adding a third item recomputes the discount;
  - removing items to below $100 removes the coupon, with the exact notice;
  - exactly $100 qualifies;
  - invalid and below-minimum codes return their errors;
  - " desk15 " works.
- **Rule 4:** express adds 12 to the total and standard adds 0, with and without a coupon.
- **Rule 5:** sign-in keeps the wishlist; wrong details return the error and leave state unchanged.
- **Rule 6:** a three-line order appears in full in both `orders[0]` and `lastOrder`, and they are deep-equal. Placing an order clears the cart and coupon. An empty cart throws.
- **Immutability:** every exported state function leaves a deep-frozen input state unchanged. Use `structuredClone` with a recursive `Object.freeze`.

`lib/` doesn't exist on `main`, so red-then-green is **not applicable** (brand-new modules). Use plain static imports; do not manufacture a red. The tests judge proves that each test asserts real behavior. *(Corrected 2026-10-28: the first version said a missing module counts as red, which contradicts `red-green.sh`. The Coding Agent flagged it during planning.)*

## CLI review (required before finishing)

Before finishing, run `coderabbit review --agent --committed --base main`. If there are no commits yet, review the uncommitted patch and say so. Fix valid findings only within the ALLOW globs, with a test for each behavior fix. In the report, list every CLI finding as fixed or skipped, with the reason. Never change a file outside ALLOW to satisfy a finding; report it instead.

## ALLOW

```
ALLOW: lib/catalog.ts
ALLOW: lib/store.ts
ALLOW: tests/store.test.mjs
```

## Required checks

- `npm ci && npm run typecheck && npm test && npm run golden:check && npm run test:e2e && npm run build`.
- Also `npm test` with bash 3.2 first in `PATH`, if available.

## Report

Changed files, the output of each check, a table mapping each rule (1–6, catalog, immutability) to its tests, and the CLI finding list.

## Appendix: catalog data (verbatim, in order)

```json
[
 {
  "id": "arc-desk-lamp",
  "name": "Arc desk lamp",
  "subtitle": "A little light. A lot of focus.",
  "description": "Meet your brightest desk companion. A sculptural silhouette, a warm, adjustable glow, and just the right amount of personality. Made for early starts and one-more-chapter nights.",
  "price": 68,
  "category": "Lighting",
  "art": "lamp",
  "background": "#ede6da",
  "colors": [
   {
    "name": "Terracotta",
    "hex": "#bd6549"
   },
   {
    "name": "Sage",
    "hex": "#7c8d76"
   },
   {
    "name": "Cream",
    "hex": "#d8cdb7"
   }
  ],
  "badge": "Bestseller",
  "rating": "4.9",
  "details": [
   "Warm, dimmable LED light",
   "Adjustable shade · 38 cm tall",
   "Powder-coated recycled aluminum",
   "USB-C cable included"
  ],
  "inStock": true
 },
 {
  "id": "form-mechanical-keyboard",
  "name": "Form mechanical keyboard",
  "subtitle": "Make every word feel good.",
  "description": "A satisfying little click for your big ideas. Our compact wireless keyboard brings soft-touch keys and a considered layout to your everyday rhythm.",
  "price": 94,
  "category": "Tech accessories",
  "art": "keyboard",
  "background": "#e7e9e3",
  "colors": [
   {
    "name": "Cloud",
    "hex": "#e0ded1"
   },
   {
    "name": "Forest",
    "hex": "#426253"
   },
   {
    "name": "Clay",
    "hex": "#bc806b"
   }
  ],
  "badge": "New arrival",
  "rating": "4.8",
  "details": [
   "75% compact layout",
   "Bluetooth + USB-C connectivity",
   "Quiet tactile switches",
   "Mac and Windows compatible"
  ],
  "inStock": true
 },
 {
  "id": "hush-wireless-headphones",
  "name": "Hush wireless headphones",
  "subtitle": "Find your own little world.",
  "description": "Less distraction, more headspace. Cushioned comfort and rich, balanced sound that takes you from your morning playlist to your afternoon deep work.",
  "price": 129,
  "category": "Tech accessories",
  "art": "headphones",
  "background": "#e7e5df",
  "colors": [
   {
    "name": "Oat",
    "hex": "#c4b69d"
   },
   {
    "name": "Ink",
    "hex": "#3e4545"
   }
  ],
  "rating": "4.9",
  "details": [
   "Active noise cancellation",
   "Up to 40 hours of listening",
   "Soft vegan leather cushions",
   "Travel pouch included"
  ],
  "inStock": true
 },
 {
  "id": "little-green-companion",
  "name": "Little green companion",
  "subtitle": "Room for something living.",
  "description": "A small reminder to take a breath. This easygoing succulent comes nestled in a handmade ceramic pot, ready to make itself at home beside your screen.",
  "price": 24,
  "category": "Little extras",
  "art": "plant",
  "background": "#e8eadd",
  "colors": [
   {
    "name": "Sand",
    "hex": "#cbb692"
   },
   {
    "name": "Chalk",
    "hex": "#e0ded4"
   }
  ],
  "badge": "A fan favorite",
  "rating": "4.7",
  "details": [
   "Live, easy-care succulent",
   "Hand-finished ceramic pot",
   "Approximately 16 cm tall",
   "Care card included"
  ],
  "inStock": true
 },
 {
  "id": "rise-laptop-stand",
  "name": "Rise laptop stand",
  "subtitle": "A fresh perspective on work.",
  "description": "Give your laptop a lift and your shoulders a break. A beautifully simple stand with a solid aluminum build, designed to make a little more space on your desk.",
  "price": 56,
  "category": "Desk essentials",
  "art": "stand",
  "background": "#e3e7e7",
  "colors": [
   {
    "name": "Silver",
    "hex": "#aeb7b5"
   },
   {
    "name": "Midnight",
    "hex": "#475758"
   }
  ],
  "rating": "4.8",
  "details": [
   "Fits 11–16 inch laptops",
   "Non-slip silicone feet",
   "Recycled aluminum construction",
   "Open design for better airflow"
  ],
  "inStock": true
 },
 {
  "id": "everyday-desk-mat",
  "name": "Everyday desk mat",
  "subtitle": "Set the tone for your day.",
  "description": "A soft landing for everything you do. Generously sized and pleasantly textured, this desk mat brings a little order and a lot of warmth to your workspace.",
  "price": 38,
  "category": "Desk essentials",
  "art": "mat",
  "background": "#ebe3d8",
  "colors": [
   {
    "name": "Cognac",
    "hex": "#a77552"
   },
   {
    "name": "Olive",
    "hex": "#717b5c"
   },
   {
    "name": "Charcoal",
    "hex": "#515451"
   }
  ],
  "rating": "4.8",
  "details": [
   "80 × 40 cm surface",
   "Water-resistant vegan leather",
   "Natural cork backing",
   "Wipes clean with a damp cloth"
  ],
  "inStock": true
 },
 {
  "id": "tidy-desk-organizer",
  "name": "Tidy desk organizer",
  "subtitle": "A home for the small things.",
  "description": "Your favorite pen, those wandering paperclips, and the things you always reach for. Give them a home with our thoughtfully divided, solid wood organizer.",
  "price": 32,
  "category": "Desk essentials",
  "art": "organizer",
  "background": "#e7e3d8",
  "colors": [
   {
    "name": "Natural oak",
    "hex": "#b38b57"
   },
   {
    "name": "Walnut",
    "hex": "#70513c"
   }
  ],
  "rating": "4.6",
  "details": [
   "Responsibly sourced solid wood",
   "Three useful compartments",
   "Soft felt base",
   "22 × 12 × 9 cm"
  ],
  "inStock": true
 },
 {
  "id": "slow-time-clock",
  "name": "Slow time clock",
  "subtitle": "Time, at a gentler pace.",
  "description": "An analog moment in a digital day. A quiet, minimal clock that keeps you grounded without adding another notification to your life.",
  "price": 42,
  "category": "Little extras",
  "art": "clock",
  "background": "#e5e7e9",
  "colors": [
   {
    "name": "Moss",
    "hex": "#667969"
   },
   {
    "name": "Rust",
    "hex": "#ae6855"
   }
  ],
  "rating": "4.9",
  "details": [
   "Silent sweep movement",
   "Solid metal case · 12 cm diameter",
   "Freestanding design",
   "One AA battery included"
  ],
  "inStock": false
 }
]
```
