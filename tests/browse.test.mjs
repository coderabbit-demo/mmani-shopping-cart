import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as browse from "../lib/browse.ts";
import { products } from "../lib/catalog.ts";
import { filterProducts, sortProducts } from "../lib/browse.ts";

const ids = (items) => items.map((item) => item.id);

test("all objects, empty and whitespace queries keep the catalog", () => {
  assert.deepEqual(filterProducts(products, { category: "All objects" }), products);
  assert.deepEqual(filterProducts(products, { query: "   " }), products);
  assert.deepEqual(filterProducts(products, {}), products);
});

test("category filters exactly", () => {
  assert.deepEqual(ids(filterProducts(products, { category: "Desk essentials" })), ["rise-laptop-stand", "everyday-desk-mat", "tidy-desk-organizer"]);
});

test("query trims and matches name, subtitle and category case-insensitively", () => {
  assert.deepEqual(ids(filterProducts(products, { query: "  LAMP  " })), ["arc-desk-lamp"]);
  assert.deepEqual(ids(filterProducts(products, { query: "own little world" })), ["hush-wireless-headphones"]);
  assert.deepEqual(ids(filterProducts(products, { query: "TECH ACCESSORIES" })), ["form-mechanical-keyboard", "hush-wireless-headphones"]);
  assert.deepEqual(filterProducts(products, { query: "<b>marker</b>" }), []);
});

test("stock and new arrival filters work independently", () => {
  assert.deepEqual(ids(filterProducts(products, { inStockOnly: true })), products.slice(0, 7).map((p) => p.id));
  assert.deepEqual(ids(filterProducts(products, { newOnly: true })), ["form-mechanical-keyboard"]);
});

test("all filters intersect, including no matches", () => {
  const filters = { category: "Tech accessories", query: "word", inStockOnly: true, newOnly: true };
  assert.deepEqual(ids(filterProducts(products, filters)), ["form-mechanical-keyboard"]);
  assert.deepEqual(filterProducts(products, { ...filters, category: "Lighting" }), []);
  assert.deepEqual(filterProducts(products, { category: "Little extras", inStockOnly: true }), [products[3]]);
});

test("featured and unknown sort preserve catalog order and return copies", () => {
  for (const sort of ["featured", "unrecognized"]) {
    const result = sortProducts(products, sort);
    assert.deepEqual(result, products);
    assert.notEqual(result, products);
  }
});

test("all numeric sorts order correctly and ties preserve catalog order", () => {
  assert.deepEqual(ids(sortProducts(products, "price-low")), ["little-green-companion", "tidy-desk-organizer", "everyday-desk-mat", "slow-time-clock", "rise-laptop-stand", "arc-desk-lamp", "form-mechanical-keyboard", "hush-wireless-headphones"]);
  assert.deepEqual(ids(sortProducts(products, "price-high")), ids(sortProducts(products, "price-low")).reverse());
  assert.deepEqual(ids(sortProducts(products, "rating")), ["arc-desk-lamp", "hush-wireless-headphones", "slow-time-clock", "form-mechanical-keyboard", "rise-laptop-stand", "everyday-desk-mat", "little-green-companion", "tidy-desk-organizer"]);
  const tied = products.slice(0, 3).map((p) => ({ ...p, price: 50, rating: "4.5" }));
  for (const sort of ["price-low", "price-high", "rating"]) assert.deepEqual(ids(sortProducts(tied, sort)), ids(tied));
});

test("filtering and sorting leave frozen inputs unchanged", () => {
  const frozen = Object.freeze(products.map((p) => Object.freeze({ ...p })));
  const before = structuredClone(frozen);
  filterProducts(frozen, { query: "desk", inStockOnly: true });
  for (const sort of ["featured", "price-low", "price-high", "rating", "unknown"]) sortProducts(frozen, sort);
  assert.deepEqual(frozen, before);
  assert.deepEqual(filterProducts([], {}), []);
  assert.deepEqual(sortProducts([], "rating"), []);
});


test("catalog swatch tokens preserve every product color", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const darkTokens = css.match(/:root\s*\{([^}]+)\}/)[1];
  for (const product of products) {
    for (const color of product.colors) {
      const slug = color.name.toLowerCase().replaceAll(" ", "-");
      const declaration = darkTokens.match(new RegExp(`--swatch-${slug}:\\s*([^;]+);`));
      assert.equal(declaration?.[1], color.hex, `${color.name} token must preserve the catalog hex`);
      assert.equal(browse.swatchToken(color.name), `var(--swatch-${slug})`);
    }
  }
  assert.equal(browse.swatchToken("Natural oak"), "var(--swatch-natural-oak)");
});
