// @ts-expect-error Node type stripping requires explicit .ts imports.
import { productById } from "./catalog.ts";
// @ts-expect-error Node type stripping requires explicit .ts imports.
import { demoAccount, initialState, subtotal, type Address, type CartItem, type Delivery, type Order, type StoreState } from "./store.ts";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function delivery(value: unknown): value is Delivery {
  return value === "standard" || value === "express";
}

function item(value: unknown, historical: boolean): CartItem | null {
  if (!record(value) || typeof value.productId !== "string") return null;
  const product = productById(value.productId);
  if (!product || typeof value.color !== "string" || !product.colors.some((color) => color.name === value.color)) return null;
  if (!historical && !product.inStock) return null;
  if (typeof value.quantity !== "number" || !Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > 10) return null;
  if (historical && !nonnegative(value.unitPrice)) return null;
  return { productId: product.id, color: value.color, quantity: value.quantity, unitPrice: historical ? value.unitPrice as number : product.price };
}

const addressLimits: Record<keyof Address, number> = { email: 254, name: 100, street: 200, city: 100, postal: 20, country: 100 };

function order(value: unknown): Order | null {
  if (!record(value) || typeof value.id !== "string" || !/^DD-[A-Z0-9]{8}$/.test(value.id)) return null;
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) return null;
  if (!Array.isArray(value.items) || value.items.length === 0) return null;
  const items = value.items.map((line) => item(line, true));
  if (items.some((line) => line === null)) return null;
  if (!nonnegative(value.subtotal) || !nonnegative(value.discount) || !nonnegative(value.shipping) || !nonnegative(value.total) || !delivery(value.delivery)) return null;
  const address = value.address;
  if (!record(address) || !Object.entries(addressLimits).every(([key, limit]) => typeof address[key] === "string" && address[key].length <= limit)) return null;
  return {
    id: value.id, createdAt: value.createdAt, items: items as CartItem[],
    subtotal: value.subtotal, discount: value.discount, shipping: value.shipping, total: value.total, delivery: value.delivery,
    address: { email: address.email as string, name: address.name as string, street: address.street as string, city: address.city as string, postal: address.postal as string, country: address.country as string },
  };
}

export function parseStoredState(raw: string | null): StoreState {
  try {
    if (raw === null) return initialState;
    const value: unknown = JSON.parse(raw);
    if (!record(value)) return initialState;
    const cart: CartItem[] = [];
    if (Array.isArray(value.cart)) for (const candidate of value.cart) {
      const line = item(candidate, false);
      if (!line) continue;
      const existing = cart.find((entry) => entry.productId === line.productId && entry.color === line.color);
      if (existing) existing.quantity = Math.min(10, existing.quantity + line.quantity);
      else cart.push(line);
    }
    const wishlist = Array.isArray(value.wishlist) ? [...new Set(value.wishlist.filter((id): id is string => typeof id === "string" && !!productById(id)))] : [];
    const state: StoreState = {
      cart, wishlist,
      user: record(value.user) && value.user.email === demoAccount.email ? { name: demoAccount.name, email: demoAccount.email } : null,
      coupon: null, delivery: delivery(value.delivery) ? value.delivery : "standard",
      orders: Array.isArray(value.orders) ? value.orders.map(order).filter((entry): entry is Order => entry !== null).slice(0, 50) : [],
      lastOrder: order(value.lastOrder), notice: null,
    };
    if (record(value.coupon) && value.coupon.code === "DESK15" && subtotal(state) >= 100) state.coupon = { code: "DESK15" };
    return state;
  } catch {
    return initialState;
  }
}

export function serializeState(state: StoreState): string {
  const line = (entry: CartItem) => ({ productId: entry.productId, color: entry.color, quantity: entry.quantity, unitPrice: entry.unitPrice });
  const receipt = (entry: Order) => ({
    id: entry.id, createdAt: entry.createdAt, items: entry.items.map(line), subtotal: entry.subtotal,
    discount: entry.discount, shipping: entry.shipping, total: entry.total, delivery: entry.delivery,
    address: { email: entry.address.email, name: entry.address.name, street: entry.address.street, city: entry.address.city, postal: entry.address.postal, country: entry.address.country },
  });
  return JSON.stringify({
    cart: state.cart.map(line), wishlist: state.wishlist,
    user: state.user ? { name: state.user.name, email: state.user.email } : null,
    coupon: state.coupon ? { code: state.coupon.code } : null, delivery: state.delivery,
    orders: state.orders.map(receipt), lastOrder: state.lastOrder ? receipt(state.lastOrder) : null,
  });
}
