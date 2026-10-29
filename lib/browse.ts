import type { Product } from "./catalog";

export type BrowseFilters = {
  category?: string;
  query?: string;
  inStockOnly?: boolean;
  newOnly?: boolean;
};

export function filterProducts(products: readonly Product[], filters: BrowseFilters): Product[] {
  const query = (filters.query ?? "").trim().toLowerCase();
  return products.filter((product) =>
    (!filters.category || filters.category === "All objects" || product.category === filters.category) &&
    (!query || [product.name, product.subtitle, product.category].some((value) => value.toLowerCase().includes(query))) &&
    (!filters.inStockOnly || product.inStock) &&
    (!filters.newOnly || product.badge === "New arrival"),
  );
}

export function sortProducts(products: readonly Product[], sort: string): Product[] {
  const result = [...products];
  switch (sort) {
    case "price-low": return result.sort((a, b) => a.price - b.price);
    case "price-high": return result.sort((a, b) => b.price - a.price);
    case "rating": return result.sort((a, b) => Number(b.rating) - Number(a.rating));
    default: return result;
  }
}
