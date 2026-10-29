import { categories, products, productById, money } from "../../lib/catalog.ts";
import {
  initialState, addItem, changeQuantity, removeItem, lineTotal, subtotal,
  applyCoupon, removeCoupon, setDelivery, totals, signIn, signOut,
  toggleWishlist, placeOrder, demoAccount,
} from "../../lib/store.ts";

const [lamp, keyboard, , plant, , , organizer, clock] = products;
const fresh = () => structuredClone(initialState);
const add = (state, product, quantity = 1, color = product.colors[0].name) =>
  addItem(state, product, color, quantity);
const cart = () => add(add(fresh(), lamp), keyboard);
const discounted = () => applyCoupon(cart(), "DESK15").state;
const address = {
  name: "Taylor Example", email: "taylor@example.test", street: "12 Example Lane",
  city: "Example City", postal: "12345", country: "US",
};
const order = (state) => placeOrder(state, address, "DD-GOLDEN1", "2026-10-28T12:00:00.000Z");
const view = (state) => ({
  state, lineTotals: state.cart.map(lineTotal), subtotal: subtotal(state),
  totals: totals(state), formattedTotals: Object.fromEntries(
    Object.entries(totals(state)).map(([key, value]) => [key, money(value)]),
  ),
});
const caught = (run) => {
  try { return run(); }
  catch (error) { return { error: { name: error.name, message: error.message } }; }
};
const scenario = (name, run) => ({ name, run });

export const scenarios = [
  scenario("catalog", () => ({
    categories: [...categories],
    products: products.map((product) => ({
      ...structuredClone(product), formattedPrice: money(product.price),
      colorNames: product.colors.map(({ name }) => name),
    })),
  })),
  scenario("money-format", () => ({ values: [0, 24.3, 68, 100.1, 137.7].map((value) => ({ value, money: money(value) })) })),
  scenario("empty-cart", () => view(fresh())),
  scenario("rule1-two-colors", () => view(add(add(fresh(), lamp), lamp, 2, "Sage"))),
  scenario("rule1-merge-same-color", () => {
    const before = add(add(fresh(), lamp), lamp, 2, "Sage");
    return { before: view(before), after: view(add(before, lamp, 3)) };
  }),
  scenario("rule1-invalid-color", () => caught(() => add(fresh(), lamp, 1, "Not a color"))),
  scenario("rule2-quantity-change", () => ({
    before: view(cart()), after: view(changeQuantity(cart(), lamp.id, "Terracotta", 3)),
  })),
  scenario("rule2-clamp", () => ({
    changeLow: view(changeQuantity(cart(), lamp.id, "Terracotta", 0)),
    changeHigh: view(changeQuantity(cart(), lamp.id, "Terracotta", 11)),
    addLow: view(add(fresh(), lamp, 0)), addHigh: view(add(fresh(), lamp, 11)),
    mergeHigh: view(add(add(fresh(), lamp, 8), lamp, 8)),
    mergeLow: view(add(add(fresh(), lamp, 2), lamp, -20)),
  })),
  scenario("rule2-invalid-quantity", () => ({
    cases: [["NaN", NaN], ["Infinity", Infinity], ["fraction", 1.5], ["string", "2"]].map(([label, quantity]) => ({
      label, add: caught(() => add(fresh(), lamp, quantity)),
      merge: caught(() => add(cart(), lamp, quantity)),
      change: caught(() => changeQuantity(cart(), lamp.id, "Terracotta", quantity)),
      missing: caught(() => changeQuantity(cart(), "missing", "Terracotta", quantity)),
    })),
  })),
  scenario("rule3-desk15-162", () => ({ result: applyCoupon(cart(), "DESK15"), ...view(discounted()) })),
  scenario("rule3-recompute-on-add", () => ({ before: view(discounted()), after: view(add(discounted(), plant)) })),
  scenario("rule3-removed-below-100", () => ({
    before: view(discounted()), after: view(removeItem(discounted(), keyboard.id, "Cloud")),
    quantityDrop: view(changeQuantity(applyCoupon(add(fresh(), lamp, 2), "DESK15").state, lamp.id, "Terracotta", 1)),
  })),
  scenario("rule3-exactly-100", () => view(applyCoupon(add(add(fresh(), lamp), organizer), " desk15 ").state)),
  scenario("rule3-invalid-codes", () => ({
    invalid: applyCoupon(cart(), "INVALID"), empty: applyCoupon(cart(), ""),
    belowMinimum: applyCoupon(add(fresh(), lamp), "DESK15"),
  })),
  scenario("rule4-express", () => ({
    standard: view(cart()), express: view(setDelivery(cart(), "express")),
    backToStandard: view(setDelivery(setDelivery(cart(), "express"), "standard")),
  })),
  scenario("rule4-express-with-coupon", () => ({ standard: view(discounted()), express: view(setDelivery(discounted(), "express")) })),
  scenario("rule5-signin-keeps-wishlist", () => {
    const before = toggleWishlist(cart(), lamp.id);
    return { before: view(before), result: signIn(before, " ALEX@DESKDROP.DEMO ", demoAccount.password) };
  }),
  scenario("rule5-wrong-credentials", () => ({
    wrongEmail: signIn(toggleWishlist(cart(), lamp.id), "wrong@example.test", demoAccount.password),
    wrongPassword: signIn(toggleWishlist(cart(), lamp.id), demoAccount.email, "wrong"),
  })),
  scenario("rule6-three-line-order", () => {
    const before = setDelivery(add(discounted(), plant), "express");
    return { before: view(before), after: view(order(before)) };
  }),
  scenario("cents-100-10", () => {
    const state = applyCoupon(add(fresh(), { ...products[0], price: 100.10 }), "DESK15").state;
    return { standard: view(state), express: view(setDelivery(state, "express")), order: order(state) };
  }),
  scenario("catalog-lookup", () => ({ found: products.map(({ id }) => productById(id)), missing: productById("missing") ?? null })),
  scenario("rule1-out-of-stock", () => caught(() => add(fresh(), clock))),
  scenario("rule1-remove-color", () => view(removeItem(add(add(fresh(), lamp), lamp, 2, "Sage"), lamp.id, "Terracotta"))),
  scenario("rule2-missing-line", () => ({ changed: view(changeQuantity(cart(), "missing", "Terracotta", 5)), removed: view(removeItem(cart(), lamp.id, "missing")) })),
  scenario("rule3-remove-coupon", () => ({ before: view(discounted()), after: view(removeCoupon(discounted())), stale: view({ ...add(fresh(), lamp), coupon: { code: "DESK15" } }) })),
  scenario("rule5-signout-wishlist-toggle", () => {
    const before = signIn(toggleWishlist(cart(), lamp.id), demoAccount.email, demoAccount.password).state;
    return { before: view(before), signedOut: view(signOut(before)), removed: view(toggleWishlist(before, lamp.id)) };
  }),
  scenario("rule6-empty-order", () => caught(() => order(fresh()))),
  scenario("rule6-order-history", () => {
    const first = order(add(add(fresh(), lamp, 2, "Sage"), lamp, 3, "Cream"));
    return { first, second: placeOrder(add(first, plant), address, "DD-GOLDEN2", "2026-10-29T12:00:00.000Z") };
  }),
  scenario("cents-line-subtotal", () => {
    const first = add(fresh(), { ...lamp, price: 0.10 }, 3);
    return { first: view(first), second: view(add(first, { ...keyboard, price: 0.20 })) };
  }),
];
