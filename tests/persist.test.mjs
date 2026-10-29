import assert from "node:assert/strict";
import test from "node:test";
import { parseStoredState, serializeState } from "../lib/persist.ts";
import { productById } from "../lib/catalog.ts";
import { initialState, demoAccount, addItem, applyCoupon, signIn, setDelivery, toggleWishlist, placeOrder } from "../lib/store.ts";

const lamp = productById("arc-desk-lamp");
const line = { productId: lamp.id, color: "Sage", quantity: 2, unitPrice: lamp.price };
const address = { email: "shopper@example.test", name: "Alex Shopper", street: "42 Demo Lane", city: "Demo City", postal: "12345", country: "Canada" };
const validOrder = { id: "DD-ABC12345", createdAt: "2026-10-29T12:00:00.000Z", items: [line], subtotal: 136, discount: 0, shipping: 12, total: 148, delivery: "express", address };
const parse = (value) => parseStoredState(JSON.stringify(value));

test("corrupt JSON and null storage return initialState without throwing", () => {
  for (const raw of [null, "{bad json", "", "undefined"]) assert.deepEqual(parseStoredState(raw), initialState);
});
for (const value of [null, [], [line], 42, "hello", true]) {
  test(`non-object stored root ${JSON.stringify(value)} returns initialState`, () => assert.deepEqual(parse(value), initialState));
}

test("missing and wrongly typed collections safely default field by field", () => {
  assert.deepEqual(parse({}), initialState);
  assert.deepEqual(parse({ cart: {}, wishlist: "lamp", orders: {}, lastOrder: [], user: [], coupon: [], notice: "stale" }), initialState);
});
for (const [name, override] of [
  ["missing product", { productId: undefined }], ["unknown product", { productId: "missing" }], ["prototype product", { productId: "__proto__" }],
  ["non-string product", { productId: 1 }], ["missing color", { color: undefined }], ["unknown color", { color: "Purple" }], ["non-string color", { color: 7 }],
  ["missing quantity", { quantity: undefined }], ["zero quantity", { quantity: 0 }], ["negative quantity", { quantity: -1 }], ["too many", { quantity: 11 }],
  ["fractional quantity", { quantity: 1.5 }], ["string quantity", { quantity: "2" }], ["nonfinite quantity", { quantity: Infinity }],
]) test(`cart drops ${name} without dropping valid neighbors`, () => {
  assert.deepEqual(parse({ cart: [{ ...line, ...override }, null, [], line] }).cart, [line]);
});

test("cart restores catalog prices even for missing or tampered stored prices", () => {
  for (const unitPrice of [undefined, 0, -5, "free", 9999]) assert.deepEqual(parse({ cart: [{ ...line, unitPrice }] }).cart, [line]);
});

test("out-of-stock products stay in past orders but are dropped from the live cart", () => {
  const clock = { productId: "slow-time-clock", color: "Moss", quantity: 1, unitPrice: 35 };
  const historical = { ...validOrder, items: [clock, line], subtotal: 171, total: 183 };
  const state = parse({ cart: [clock, line], orders: [historical], lastOrder: historical });
  assert.deepEqual(state.orders, [historical]);
  assert.deepEqual(state.lastOrder, historical);
  assert.deepEqual(state.cart, [line]);
});

test("duplicate cart lines merge and clamp at ten; different colors remain separate", () => {
  assert.deepEqual(parse({ cart: [line, { ...line, quantity: 9 }, { ...line, color: "Terracotta", quantity: 1 }] }).cart,
    [{ ...line, quantity: 10 }, { ...line, color: "Terracotta", quantity: 1 }]);
  assert.equal(parse({ cart: [{ ...line, quantity: 1 }] }).cart[0].quantity, 1);
});

test("wishlist retains unique catalog IDs in stored order", () => {
  assert.deepEqual(parse({ wishlist: ["form-mechanical-keyboard", lamp.id, lamp.id, "missing", "constructor", null, {}] }).wishlist, ["form-mechanical-keyboard", lamp.id]);
});

test("foreign identity is rejected and matching email gets only the canonical demo identity", () => {
  assert.equal(parse({ user: { name: "Mallory", email: "x@y.z" } }).user, null);
  assert.deepEqual(parse({ user: { name: "Mallory", email: demoAccount.email, password: demoAccount.password, admin: true } }).user, { name: demoAccount.name, email: demoAccount.email });
});

test("coupon requires exact DESK15 and rebuilt catalog subtotal at least 100", () => {
  assert.equal(parse({ cart: [{ ...line, quantity: 1, unitPrice: 1000 }], coupon: { code: "DESK15" } }).coupon, null);
  assert.deepEqual(parse({ cart: [line], coupon: { code: "DESK15", extra: true } }).coupon, { code: "DESK15" });
  assert.equal(parse({ cart: [line], coupon: { code: "desk15" } }).coupon, null);
  const organizer = productById("tidy-desk-organizer");
  assert.deepEqual(parse({ cart: [{ ...line, quantity: 1 }, { productId: organizer.id, color: organizer.colors[0].name, quantity: 1 }], coupon: { code: "DESK15" } }).coupon, { code: "DESK15" });
});

test("delivery permits standard or express and defaults invalid values", () => {
  for (const delivery of [null, "overnight", {}, 1]) assert.equal(parse({ delivery }).delivery, "standard");
  for (const delivery of ["standard", "express"]) assert.equal(parse({ delivery }).delivery, delivery);
});

for (const [name, override] of [
  ["bad id", { id: "DD-abc12345" }], ["short id", { id: "DD-ABC" }], ["missing id", { id: undefined }],
  ["invalid date", { createdAt: "yesterday-ish" }], ["non-string date", { createdAt: 0 }],
  ["empty items", { items: [] }], ["missing items", { items: undefined }],
  ["bad product", { items: [{ ...line, productId: "missing" }] }], ["bad color", { items: [{ ...line, color: "Purple" }] }],
  ["bad quantity", { items: [{ ...line, quantity: 999 }] }], ["fractional quantity", { items: [{ ...line, quantity: 1.5 }] }],
  ["negative price", { items: [{ ...line, unitPrice: -1 }] }], ["missing price", { items: [{ productId: lamp.id, color: "Sage", quantity: 1 }] }],
  ["infinite price", { items: [{ ...line, unitPrice: Infinity }] }],
  ["negative subtotal", { subtotal: -1 }], ["invalid discount", { discount: "0" }], ["invalid shipping", { shipping: Infinity }], ["negative total", { total: -1 }],
  ["bad delivery", { delivery: "overnight" }], ["missing address", { address: undefined }], ["non-string address field", { address: { ...address, city: 123 } }],
]) test(`invalid orders: ${name} is dropped individually, including lastOrder`, () => {
  const invalid = { ...validOrder, ...override };
  const state = parse({ orders: [invalid, validOrder, invalid], lastOrder: invalid });
  assert.deepEqual(state.orders, [validOrder]);
  assert.equal(state.lastOrder, null);
});

for (const [key, limit] of Object.entries({ email: 254, name: 100, street: 200, city: 100, postal: 20, country: 100 })) {
  test(`order address ${key} permits ${limit} characters and rejects ${limit + 1}`, () => {
    const atLimit = { ...validOrder, address: { ...address, [key]: "a".repeat(limit) } };
    assert.deepEqual(parse({ orders: [atLimit] }).orders, [atLimit]);
    assert.deepEqual(parse({ orders: [{ ...atLimit, address: { ...address, [key]: "a".repeat(limit + 1) } }] }).orders, []);
  });
}

test("historical prices are preserved, including zero; order cap keeps the first 50 valid orders", () => {
  const historical = { ...validOrder, items: [{ ...line, unitPrice: 1.25 }, { ...line, unitPrice: 0 }] };
  assert.deepEqual(parse({ lastOrder: historical }).lastOrder, historical);
  const orders = Array.from({ length: 53 }, (_, n) => ({ ...validOrder, id: `DD-${n.toString().padStart(8, "0")}` }));
  assert.deepEqual(parse({ orders: [null, ...orders] }).orders, orders.slice(0, 50));
});

test("prototype payload and extra keys are dropped at every level without pollution", () => {
  const hostile = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
  const state = parse({ ...hostile, cart: [{ ...line, ...hostile }], orders: [{ ...validOrder, ...hostile, address: { ...address, ...hostile }, items: [{ ...line, ...hostile }] }], lastOrder: validOrder, notice: "stale" });
  assert.deepEqual(state, { ...initialState, cart: [line], orders: [validOrder], lastOrder: validOrder });
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.hasOwn(state, "__proto__"), false);
  state.cart[0].quantity = 1;
  assert.equal(line.quantity, 2);
  assert.deepEqual(initialState.cart, []);
});

test("serialization omits notice, extra keys and password at every object boundary", () => {
  const s = { ...initialState, extra: true, cart: [{ ...line, extra: true }], user: { name: demoAccount.name, email: demoAccount.email, password: demoAccount.password }, orders: [{ ...validOrder, extra: true, address: { ...address, extra: true } }], lastOrder: validOrder, notice: "stale" };
  const raw = serializeState(s);
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ["cart", "wishlist", "user", "coupon", "delivery", "orders", "lastOrder"].sort());
  assert.equal(raw.includes("extra"), false);
  assert.equal(raw.includes("notice"), false);
  assert.equal(raw.includes(demoAccount.password), false);
});

test("realistic state with two orders round trips exactly", () => {
  let state = signIn(initialState, demoAccount.email, demoAccount.password).state;
  state = toggleWishlist(toggleWishlist(state, lamp.id), "form-mechanical-keyboard");
  state = setDelivery(addItem(state, lamp, "Sage", 2), "express");
  state = placeOrder(state, address, "DD-ABC12345", validOrder.createdAt);
  state = placeOrder(addItem(state, lamp, "Terracotta", 1), address, "DD-DEF67890", "2026-10-29T13:00:00Z");
  state = setDelivery(applyCoupon(addItem(state, lamp, "Sage", 2), "DESK15").state, "express");
  assert.deepEqual(parseStoredState(serializeState(state)), state);
});
