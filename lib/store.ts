import type { Product } from "./catalog";

export type CartItem = {
  productId: string;
  color: string;
  quantity: number;
  unitPrice: number;
};

export type Delivery = "standard" | "express";

export type Address = {
  name: string;
  email: string;
  street: string;
  city: string;
  postal: string;
  country: string;
};

export type Order = {
  id: string;
  createdAt: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  delivery: Delivery;
  address: Address;
};

export type StoreState = {
  cart: CartItem[];
  wishlist: string[];
  user: { name: string; email: string } | null;
  coupon: { code: "DESK15" } | null;
  delivery: Delivery;
  orders: Order[];
  lastOrder: Order | null;
  notice: string | null;
};

export const initialState: StoreState = {
  cart: [],
  wishlist: [],
  user: null,
  coupon: null,
  delivery: "standard",
  orders: [],
  lastOrder: null,
  notice: null,
};

export const STORAGE_KEY = "deskdrop-demo-v1";

// Fixture-only demo credentials; this is not real authentication.
export const demoAccount = {
  email: "alex@deskdrop.demo",
  password: "deskdrop123",
  name: "Alex Morgan",
};

function validateQuantity(quantity: number): void {
  if (!Number.isInteger(quantity)) throw new RangeError("Quantity must be a whole number.");
}

function clampQuantity(quantity: number): number {
  return Math.min(10, Math.max(1, quantity));
}

function updateCart(state: StoreState, cart: CartItem[]): StoreState {
  const changed = { ...state, cart, notice: null };
  if (state.coupon && subtotal(changed) < 100) {
    return {
      ...changed,
      coupon: null,
      notice: "DESK15 was removed because your subtotal dropped below $100.",
    };
  }
  return changed;
}

export function addItem(state: StoreState, product: Product, color: string, quantity: number): StoreState {
  validateQuantity(quantity);
  if (!product.inStock || !product.colors.some((option) => option.name === color)) {
    throw new RangeError("Choose an available product and one of its colors.");
  }
  const existing = state.cart.find((item) => item.productId === product.id && item.color === color);
  const cart = existing
    ? state.cart.map((item) => item === existing
      ? { ...item, quantity: clampQuantity(item.quantity + quantity) }
      : item)
    : [...state.cart, { productId: product.id, color, quantity: clampQuantity(quantity), unitPrice: product.price }];
  return updateCart(state, cart);
}

export function changeQuantity(state: StoreState, productId: string, color: string, quantity: number): StoreState {
  validateQuantity(quantity);
  return updateCart(state, state.cart.map((item) => item.productId === productId && item.color === color
    ? { ...item, quantity: clampQuantity(quantity) }
    : item));
}

export function removeItem(state: StoreState, productId: string, color: string): StoreState {
  return updateCart(state, state.cart.filter((item) => item.productId !== productId || item.color !== color));
}

function lineTotalCents(item: CartItem): number {
  return Math.round(item.unitPrice * 100) * item.quantity;
}

function subtotalCents(state: StoreState): number {
  return state.cart.reduce((sum, item) => sum + lineTotalCents(item), 0);
}

export function lineTotal(item: CartItem): number {
  return lineTotalCents(item) / 100;
}

export function subtotal(state: StoreState): number {
  return subtotalCents(state) / 100;
}

export function applyCoupon(state: StoreState, code: string): { state: StoreState; error?: string } {
  if (code.trim().toUpperCase() !== "DESK15") {
    return { state: { ...state }, error: "That code isn't valid." };
  }
  if (subtotal(state) < 100) {
    return { state: { ...state }, error: "DESK15 needs a subtotal of at least $100." };
  }
  return { state: { ...state, coupon: { code: "DESK15" } } };
}

export function removeCoupon(state: StoreState): StoreState {
  return { ...state, coupon: null };
}

export function setDelivery(state: StoreState, delivery: Delivery): StoreState {
  return { ...state, delivery };
}

export function totals(state: StoreState): { subtotal: number; discount: number; shipping: number; total: number } {
  const currentSubtotalCents = subtotalCents(state);
  const discountCents = state.coupon && currentSubtotalCents >= 10000 ? Math.round(currentSubtotalCents * 15 / 100) : 0;
  const shippingCents = state.delivery === "express" ? 1200 : 0;
  return {
    subtotal: currentSubtotalCents / 100,
    discount: discountCents / 100,
    shipping: shippingCents / 100,
    total: (currentSubtotalCents - discountCents + shippingCents) / 100,
  };
}

export function signIn(state: StoreState, email: string, password: string): { state: StoreState; error?: string } {
  if (email.trim().toLowerCase() !== demoAccount.email || password !== demoAccount.password) {
    return { state: { ...state }, error: "Those details don't match our demo account." };
  }
  return { state: { ...state, user: { name: demoAccount.name, email: demoAccount.email } } };
}

export function signOut(state: StoreState): StoreState {
  return { ...state, user: null };
}

export function toggleWishlist(state: StoreState, productId: string): StoreState {
  const wishlist = state.wishlist.includes(productId)
    ? state.wishlist.filter((id) => id !== productId)
    : [...state.wishlist, productId];
  return { ...state, wishlist };
}

export function placeOrder(state: StoreState, address: Address, id: string, createdAt: string): StoreState {
  if (state.cart.length === 0) throw new Error("Cannot place an order with an empty cart.");
  const order: Order = {
    id,
    createdAt,
    items: state.cart.map((item) => ({ ...item })),
    ...totals(state),
    delivery: state.delivery,
    address: { ...address },
  };
  return {
    ...state,
    cart: [],
    coupon: null,
    delivery: "standard",
    orders: [order, ...state.orders],
    lastOrder: order,
    notice: null,
  };
}
