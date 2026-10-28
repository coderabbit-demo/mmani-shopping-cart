import assert from "node:assert/strict";
import test from "node:test";
import { categories, products, productById, money } from "../lib/catalog.ts";
import {
  initialState, STORAGE_KEY, demoAccount, addItem, changeQuantity, removeItem,
  lineTotal, subtotal, applyCoupon, removeCoupon, setDelivery, totals,
  signIn, signOut, toggleWishlist, placeOrder,
} from "../lib/store.ts";

const expectedProducts = [
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
];

const [lamp, keyboard, headphones, plant, stand, mat, organizer, clock] = products;
const address = {
  name: "Taylor Example", email: "taylor@example.test", street: "12 Example Lane",
  city: "Example City", postal: "12345", country: "US",
};
const removalNotice = "DESK15 was removed because your subtotal dropped below $100.";
const freshState = () => structuredClone(initialState);
const add = (state, product, quantity = 1) => addItem(state, product, product.colors[0].name, quantity);
const twoItemCart = () => add(add(freshState(), lamp), keyboard);
const threeItemCart = () => add(twoItemCart(), plant);

function freeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function richState() {
  const order = {
    id: "prior-order", createdAt: "2026-10-27T12:00:00.000Z",
    items: [{ productId: plant.id, color: "Sand", quantity: 1, unitPrice: 24 }],
    subtotal: 24, discount: 0, shipping: 0, total: 24, delivery: "standard",
    address: structuredClone(address),
  };
  return {
    ...threeItemCart(), wishlist: [lamp.id], user: { name: "Alex Morgan", email: "alex@deskdrop.demo" },
    coupon: { code: "DESK15" }, delivery: "express", orders: [order], lastOrder: order,
    notice: "Earlier notice",
  };
}

test("catalog: all eight products and categories match the appendix in order", () => {
  assert.deepEqual(products, expectedProducts);
  assert.deepEqual(categories, ["All objects", "Desk essentials", "Lighting", "Tech accessories", "Little extras"]);
});

test("catalog: unique IDs, positive prices, colors, and only the clock out of stock", () => {
  assert.equal(products.length, 8);
  assert.equal(new Set(products.map((product) => product.id)).size, 8);
  for (const product of products) {
    assert.ok(product.price > 0, product.id);
    assert.ok(product.colors.length > 0, product.id);
  }
  assert.deepEqual(products.filter((product) => !product.inStock).map((product) => product.id), ["slow-time-clock"]);
});

test("catalog: productById finds every product and returns undefined for an unknown ID", () => {
  for (const product of products) assert.deepEqual(productById(product.id), product);
  assert.equal(productById("missing-product"), undefined);
});

test("catalog: money formats whole dollars without cents and fractional dollars with two decimals", () => {
  assert.equal(money(68), "$68");
  assert.equal(money(24.3), "$24.30");
  assert.equal(money(24.35), "$24.35");
  assert.equal(money(0), "$0");
  assert.equal(money(1234), "$1,234");
});

test("state: empty defaults, storage key, and fixture-only demo account", () => {
  assert.deepEqual(initialState, {
    cart: [], wishlist: [], user: null, coupon: null, delivery: "standard",
    orders: [], lastOrder: null, notice: null,
  });
  assert.equal(STORAGE_KEY, "deskdrop-demo-v1");
  assert.deepEqual(demoAccount, { email: "alex@deskdrop.demo", password: "deskdrop123", name: "Alex Morgan" });
});

test("rule 1: two colors make two lines and adding the same color merges only that line", () => {
  let state = addItem(freshState(), lamp, "Terracotta", 1);
  state = addItem(state, lamp, "Sage", 2);
  state = addItem(state, lamp, "Terracotta", 3);
  assert.deepEqual(state.cart, [
    { productId: lamp.id, color: "Terracotta", quantity: 4, unitPrice: 68 },
    { productId: lamp.id, color: "Sage", quantity: 2, unitPrice: 68 },
  ]);
  assert.equal(subtotal(state), 408);
});

test("rule 1: invalid colors and out-of-stock products throw RangeError without changing state", () => {
  const state = freeze(structuredClone(twoItemCart()));
  const before = structuredClone(state);
  assert.throws(() => addItem(state, lamp, "Not a color", 1), RangeError);
  assert.throws(() => addItem(state, lamp, "sage", 1), RangeError);
  assert.throws(() => addItem(state, clock, "Moss", 1), RangeError);
  assert.deepEqual(state, before);
});

test("rule 1: changing and removing a line use both product ID and color", () => {
  let state = addItem(addItem(add(freshState(), keyboard), lamp, "Terracotta", 1), lamp, "Sage", 2);
  state = changeQuantity(state, lamp.id, "Sage", 3);
  assert.deepEqual(state.cart.map(({ productId, color, quantity }) => ({ productId, color, quantity })), [
    { productId: keyboard.id, color: "Cloud", quantity: 1 },
    { productId: lamp.id, color: "Terracotta", quantity: 1 },
    { productId: lamp.id, color: "Sage", quantity: 3 },
  ]);
  state = removeItem(state, lamp.id, "Terracotta");
  assert.deepEqual(state.cart.map((item) => item.color), ["Cloud", "Sage"]);
  assert.equal(subtotal(state), 298);
});

test("rule 2: changing quantity recomputes line total and subtotal with no stored line total", () => {
  const state = changeQuantity(twoItemCart(), lamp.id, "Terracotta", 3);
  assert.equal(lineTotal(state.cart[0]), 204);
  assert.equal(subtotal(state), 298);
  assert.deepEqual(Object.keys(state.cart[0]).sort(), ["color", "productId", "quantity", "unitPrice"]);
  assert.equal(subtotal(freshState()), 0);
});

test("rule 2: quantity changes clamp 0 to 1 and 11 to 10", () => {
  const state = twoItemCart();
  const low = changeQuantity(state, lamp.id, "Terracotta", 0);
  const high = changeQuantity(state, lamp.id, "Terracotta", 11);
  assert.equal(low.cart[0].quantity, 1);
  assert.equal(lineTotal(low.cart[0]), 68);
  assert.equal(subtotal(low), 162);
  assert.equal(high.cart[0].quantity, 10);
  assert.equal(lineTotal(high.cart[0]), 680);
  assert.equal(subtotal(high), 774);
});

test("rule 2: add clamps new lines and the resulting merged quantity", () => {
  assert.equal(add(freshState(), lamp, 0).cart[0].quantity, 1);
  assert.equal(add(freshState(), lamp, 11).cart[0].quantity, 10);
  assert.equal(add(add(freshState(), lamp, 8), lamp, 8).cart[0].quantity, 10);
  assert.equal(add(add(freshState(), lamp, 2), lamp, -20).cart[0].quantity, 1);
});

test("rule 2: unknown lines leave cart contents unchanged and return a fresh state", () => {
  const state = twoItemCart();
  for (const result of [changeQuantity(state, "unknown", "Terracotta", 5), removeItem(state, lamp.id, "unknown")]) {
    assert.deepEqual(result, state);
    assert.notStrictEqual(result, state);
  }
});

test("rule 3: DESK15 discounts a 162 subtotal by 24.30 for a total of 137.70", () => {
  const result = applyCoupon(twoItemCart(), "DESK15");
  assert.equal(result.error, undefined);
  assert.deepEqual(result.state.coupon, { code: "DESK15" });
  assert.deepEqual(totals(result.state), { subtotal: 162, discount: 24.3, shipping: 0, total: 137.7 });
  assert.equal(Object.hasOwn(result.state, "discount"), false);
  assert.deepEqual(Object.keys(result.state.coupon), ["code"]);
});

test("rule 3: adding a third item and changing quantity recompute the discount", () => {
  const state = applyCoupon(twoItemCart(), "DESK15").state;
  const third = add(state, plant);
  assert.deepEqual(totals(third), { subtotal: 186, discount: 27.9, shipping: 0, total: 158.1 });
  const changed = changeQuantity(third, lamp.id, "Terracotta", 2);
  assert.deepEqual(totals(changed), { subtotal: 254, discount: 38.1, shipping: 0, total: 215.9 });
  const removed = removeItem(third, plant.id, "Sand");
  assert.deepEqual(totals(removed), { subtotal: 162, discount: 24.3, shipping: 0, total: 137.7 });
  assert.deepEqual(removed.coupon, { code: "DESK15" });
  assert.equal(removed.notice, null);
});

for (const [label, change] of [
  ["add", (state) => add(state, lamp, -1)],
  ["quantity change", (state) => changeQuantity(state, lamp.id, "Terracotta", 1)],
  ["remove", (state) => removeItem(state, lamp.id, "Terracotta")],
]) {
  test(`rule 3: ${label} below $100 removes DESK15 with the exact notice`, () => {
    const state = applyCoupon(add(freshState(), lamp, 2), "DESK15").state;
    const changed = change(state);
    assert.equal(changed.coupon, null);
    assert.equal(changed.notice, removalNotice);
    assert.equal(totals(changed).discount, 0);
    assert.ok(subtotal(changed) < 100);
  });
}

test("rule 3: any other cart change clears a stale notice", () => {
  for (const coupon of [null, { code: "DESK15" }]) {
    const state = { ...twoItemCart(), coupon, notice: removalNotice };
    for (const result of [add(state, plant), changeQuantity(state, lamp.id, "Terracotta", 2), removeItem(state, "missing", "missing")]) {
      assert.equal(result.notice, null);
      assert.deepEqual(result.coupon, coupon);
    }
  }
  const below = { ...add(freshState(), lamp), notice: removalNotice };
  assert.equal(changeQuantity(below, lamp.id, "Terracotta", 1).notice, null);
});

test("rule 3: exactly $100 qualifies and coupon input is trimmed and case-insensitive", () => {
  const state = add(add(freshState(), lamp), organizer);
  const result = applyCoupon(state, " desk15 ");
  assert.equal(result.error, undefined);
  assert.deepEqual(totals(result.state), { subtotal: 100, discount: 15, shipping: 0, total: 85 });
});

test("rule 3: invalid and below-minimum codes return exact errors without changing state", () => {
  for (const [state, code, error] of [
    [twoItemCart(), "UNKNOWN", "That code isn't valid."],
    [add(freshState(), lamp), "DESK15", "DESK15 needs a subtotal of at least $100."],
    [freshState(), "", "That code isn't valid."],
  ]) {
    const before = structuredClone(state);
    const result = applyCoupon(state, code);
    assert.equal(result.error, error);
    assert.deepEqual(result.state, before);
    assert.notStrictEqual(result.state, state);
    assert.deepEqual(state, before);
  }
});

test("rule 3: removing a coupon restores full totals and stale ineligible coupons grant no discount", () => {
  const applied = applyCoupon(twoItemCart(), "DESK15").state;
  const result = removeCoupon(applied);
  assert.equal(result.coupon, null);
  assert.deepEqual(totals(result), { subtotal: 162, discount: 0, shipping: 0, total: 162 });
  assert.deepEqual(totals({ ...add(freshState(), lamp), coupon: { code: "DESK15" } }), {
    subtotal: 68, discount: 0, shipping: 0, total: 68,
  });
});

test("rule 3: discounts and final totals round to cents", () => {
  const state = applyCoupon(add(freshState(), { ...lamp, price: 100.25 }), "DESK15").state;
  assert.deepEqual(totals(state), { subtotal: 100.25, discount: 15.04, shipping: 0, total: 85.21 });
});

for (const coupon of [false, true]) {
  test(`rule 4: express adds $12 and standard adds $0 ${coupon ? "with" : "without"} a coupon`, () => {
    const state = coupon ? applyCoupon(twoItemCart(), "DESK15").state : twoItemCart();
    const express = setDelivery(state, "express");
    assert.deepEqual(totals(express), { subtotal: 162, discount: coupon ? 24.3 : 0, shipping: 12, total: coupon ? 149.7 : 174 });
    const standard = setDelivery(express, "standard");
    assert.deepEqual(totals(standard), { subtotal: 162, discount: coupon ? 24.3 : 0, shipping: 0, total: coupon ? 137.7 : 162 });
  });
}

test("rule 5: sign-in normalizes email and preserves the wishlist and cart", () => {
  const state = toggleWishlist(twoItemCart(), headphones.id);
  const result = signIn(state, " ALEX@DESKDROP.DEMO ", "deskdrop123");
  assert.equal(result.error, undefined);
  assert.deepEqual(result.state.user, { name: "Alex Morgan", email: "alex@deskdrop.demo" });
  assert.deepEqual(result.state.wishlist, [headphones.id]);
  assert.deepEqual(result.state.cart, state.cart);
  assert.equal(Object.hasOwn(result.state.user, "password"), false);
});

test("rule 5: wrong credentials return the exact error and unchanged state", () => {
  const state = freeze(structuredClone(richState()));
  const before = structuredClone(state);
  for (const [email, password] of [
    ["other@example.test", "deskdrop123"], ["alex@deskdrop.demo", "wrong"],
    ["alex@deskdrop.demo", " DESKDROP123 "],
  ]) {
    const result = signIn(state, email, password);
    assert.equal(result.error, "Those details don't match our demo account.");
    assert.deepEqual(result.state, before);
    assert.notStrictEqual(result.state, state);
  }
  assert.deepEqual(state, before);
});

test("rule 5: sign-out clears only the user", () => {
  const state = richState();
  assert.deepEqual(signOut(state), { ...state, user: null });
});

test("wishlist: toggling adds and removes exactly the selected product", () => {
  let state = toggleWishlist(freshState(), lamp.id);
  state = toggleWishlist(state, keyboard.id);
  assert.deepEqual(state.wishlist, [lamp.id, keyboard.id]);
  state = toggleWishlist(state, lamp.id);
  assert.deepEqual(state.wishlist, [keyboard.id]);
  assert.deepEqual(state.cart, []);
});

test("rule 6: all three lines and current totals appear in lastOrder and order history", () => {
  const state = { ...richState(), notice: removalNotice };
  const result = placeOrder(state, address, "order-1", "2026-10-28T12:00:00.000Z");
  const expected = {
    id: "order-1", createdAt: "2026-10-28T12:00:00.000Z",
    items: [
      { productId: lamp.id, color: "Terracotta", quantity: 1, unitPrice: 68 },
      { productId: keyboard.id, color: "Cloud", quantity: 1, unitPrice: 94 },
      { productId: plant.id, color: "Sand", quantity: 1, unitPrice: 24 },
    ],
    subtotal: 186, discount: 27.9, shipping: 12, total: 170.1, delivery: "express",
    address,
  };
  assert.deepEqual(result.lastOrder, expected);
  assert.deepEqual(result.orders[0], expected);
  assert.deepEqual(result.orders[0], result.lastOrder);
  assert.deepEqual(result.orders.slice(1), state.orders);
  assert.deepEqual(result.cart, []);
  assert.equal(result.coupon, null);
  assert.equal(result.delivery, "standard");
  assert.equal(result.notice, null);
  assert.deepEqual(result.user, state.user);
  assert.deepEqual(result.wishlist, state.wishlist);
});

test("rule 6: order snapshots copy every line and address independently of caller data", () => {
  const state = threeItemCart();
  const suppliedAddress = structuredClone(address);
  const result = placeOrder(state, suppliedAddress, "order-copy", "2026-10-28T12:00:00.000Z");
  const before = structuredClone(result.lastOrder);
  for (const order of [result.orders[0], result.lastOrder]) {
    assert.notStrictEqual(order.items, state.cart);
    for (let i = 0; i < state.cart.length; i++) assert.notStrictEqual(order.items[i], state.cart[i]);
    assert.notStrictEqual(order.address, suppliedAddress);
  }
  state.cart[0].quantity = 10;
  state.cart[1].color = "Forest";
  state.cart[2].unitPrice = 99;
  suppliedAddress.street = "Changed address";
  assert.deepEqual(result.lastOrder, before);
  assert.deepEqual(result.orders[0], before);
});

test("rule 6: same-product color lines and quantities survive ordering", () => {
  const state = addItem(addItem(freshState(), lamp, "Sage", 2), lamp, "Cream", 3);
  const result = placeOrder(state, address, "color-order", "2026-10-28T12:00:00.000Z");
  assert.deepEqual(result.lastOrder.items, state.cart);
  assert.deepEqual(result.orders[0].items.map(({ color, quantity }) => [color, quantity]), [["Sage", 2], ["Cream", 3]]);
  assert.equal(result.lastOrder.total, 340);
});

test("rule 6: placing an order with an empty cart throws without changing state", () => {
  const state = freeze(structuredClone(initialState));
  assert.throws(() => placeOrder(state, address, "empty-order", "2026-10-28T12:00:00.000Z"), Error);
  assert.deepEqual(state, initialState);
});

const mutations = [
  ["addItem (new line)", (s) => add(s, mat), (s) => assert.equal(s.cart.at(-1).productId, mat.id)],
  ["addItem (merge)", (s) => add(s, lamp), (s) => assert.equal(s.cart[0].quantity, 2)],
  ["changeQuantity", (s) => changeQuantity(s, lamp.id, "Terracotta", 4), (s) => assert.equal(s.cart[0].quantity, 4)],
  ["removeItem", (s) => removeItem(s, lamp.id, "Terracotta"), (s) => assert.deepEqual(s.cart.map((i) => i.productId), [keyboard.id, plant.id])],
  ["applyCoupon", (s) => applyCoupon(s, "desk15").state, (s) => assert.deepEqual(s.coupon, { code: "DESK15" })],
  ["applyCoupon (error)", (s) => applyCoupon(s, "bad").state, (s) => assert.equal(s.cart.length, 3)],
  ["removeCoupon", removeCoupon, (s) => assert.equal(s.coupon, null)],
  ["setDelivery", (s) => setDelivery(s, "standard"), (s) => assert.equal(s.delivery, "standard")],
  ["signIn", (s) => signIn(s, demoAccount.email, demoAccount.password).state, (s) => assert.deepEqual(s.user, { name: demoAccount.name, email: demoAccount.email })],
  ["signIn (error)", (s) => signIn(s, demoAccount.email, "bad").state, (s) => assert.equal(s.user.name, "Alex Morgan")],
  ["signOut", signOut, (s) => assert.equal(s.user, null)],
  ["toggleWishlist (add)", (s) => toggleWishlist(s, plant.id), (s) => assert.deepEqual(s.wishlist, [lamp.id, plant.id])],
  ["toggleWishlist (remove)", (s) => toggleWishlist(s, lamp.id), (s) => assert.deepEqual(s.wishlist, [])],
  ["placeOrder", (s) => placeOrder(s, freeze(structuredClone(address)), "frozen-order", "2026-10-28T12:00:00.000Z"), (s) => assert.equal(s.orders[0].items.length, 3)],
];
for (const [name, operation, check] of mutations) {
  test(`immutability: ${name} returns a fresh state and preserves deep-frozen input`, () => {
    const before = richState();
    const state = freeze(structuredClone(before));
    const result = operation(state);
    assert.notStrictEqual(result, state);
    assert.deepEqual(state, before);
    check(result);
  });
}

test("immutability: selectors and catalog inputs accept frozen data without mutation", () => {
  const state = freeze(structuredClone(richState()));
  const product = freeze(structuredClone(stand));
  const before = structuredClone(state);
  assert.equal(lineTotal(state.cart[0]), 68);
  assert.equal(subtotal(state), 186);
  assert.deepEqual(totals(state), { subtotal: 186, discount: 27.9, shipping: 12, total: 170.1 });
  assert.equal(add(state, product).cart.at(-1).unitPrice, 56);
  assert.deepEqual(state, before);
  assert.deepEqual(product, stand);
});

test("rule 3: cent-price regression rounds the $100.10 DESK15 discount half-up", () => {
  const state = applyCoupon(add(freshState(), { ...lamp, price: 100.10 }), "DESK15").state;
  assert.deepEqual(totals(state), { subtotal: 100.1, discount: 15.02, shipping: 0, total: 85.08 });
});

test("rule 4: cent-price regression includes express shipping after the rounded discount", () => {
  const state = setDelivery(applyCoupon(add(freshState(), { ...lamp, price: 100.10 }), "DESK15").state, "express");
  assert.deepEqual(totals(state), { subtotal: 100.1, discount: 15.02, shipping: 12, total: 97.08 });
});

test("rule 2: cent-price regression computes an exact $0.30 line total for three $0.10 items", () => {
  const state = add(freshState(), { ...lamp, price: 0.10 }, 3);
  assert.equal(lineTotal(state.cart[0]), 0.3);
});

test("rule 2: cent-price regression sums subtotals in cents across quantities and lines", () => {
  const state = add(freshState(), { ...lamp, price: 0.10 }, 3);
  assert.equal(subtotal(state), 0.3);
  const twoLines = add(state, { ...keyboard, price: 0.20 });
  assert.equal(subtotal(twoLines), 0.5);
  assert.deepEqual(totals(twoLines), { subtotal: 0.5, discount: 0, shipping: 0, total: 0.5 });
});

test("rule 6: cent-price regression snapshots the rounded discount and total in both order records", () => {
  const state = applyCoupon(add(freshState(), { ...lamp, price: 100.10 }), "DESK15").state;
  const result = placeOrder(state, address, "cent-order", "2026-10-28T12:00:00.000Z");
  const expected = {
    id: "cent-order", createdAt: "2026-10-28T12:00:00.000Z",
    items: [{ productId: lamp.id, color: "Terracotta", quantity: 1, unitPrice: 100.1 }],
    subtotal: 100.1, discount: 15.02, shipping: 0, total: 85.08,
    delivery: "standard", address,
  };
  assert.deepEqual(result.lastOrder, expected);
  assert.deepEqual(result.orders[0], expected);
});

for (const [label, quantity] of [["NaN", NaN], ["Infinity", Infinity], ["1.5", 1.5], ['"2"', "2"]]) {
  for (const [operation, change] of [
    ["addItem (new line)", (state) => add(state, mat, quantity)],
    ["addItem (merge)", (state) => add(state, lamp, quantity)],
    ["changeQuantity (existing line)", (state) => changeQuantity(state, lamp.id, "Terracotta", quantity)],
    ["changeQuantity (missing line)", (state) => changeQuantity(state, "missing", "Terracotta", quantity)],
  ]) {
    test(`rule 2: quantity-validation regression: ${operation} rejects ${label} without changing frozen state`, () => {
      const before = richState();
      const state = freeze(structuredClone(before));
      assert.throws(() => change(state), { name: "RangeError", message: "Quantity must be a whole number." });
      assert.deepEqual(state, before);
    });
  }
}
