"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { money, productById } from "../lib/catalog";
import { applyCoupon, changeQuantity, lineTotal, removeCoupon, removeItem } from "../lib/store";
import { useStore } from "./store-provider";
import { ProductArt } from "./product-art";
import { Breadcrumb, OrderSummary, Quantity } from "./commerce";

export function Cart() {
  const { state, update, notify } = useStore();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const quantity = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  function submitCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = applyCoupon(state, code);
    setError(result.error);
    if (!result.error) {
      update((current) => applyCoupon(current, code).state);
      notify("A little treat: 15% off applied.");
    }
  }
  return <main className="cart-page wrap">
    <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Your bag" }]} />
    <h1>Your bag <span className="bag-quantity">({quantity})</span></h1>
    {state.notice && <p className="cart-notice" role="status">{state.notice}</p>}
    {state.cart.length === 0 ? <section className="bag-empty"><ShoppingBag size={36} aria-hidden="true" /><h2>Room for something good.</h2><p>Your bag is empty. Let’s find something that feels like you.</p><Link className="primary-button" href="/">Find your next favorite <ArrowRight size={18} aria-hidden="true" /></Link></section> : <div className="cart-layout">
      <div className="cart-lines">{state.cart.map((item) => {
        const product = productById(item.productId)!;
        const label = `${product.name} (${item.color})`;
        return <article className="cart-line" key={`${item.productId}:${item.color}`} aria-label={label}>
          <Link className="cart-art" href={`/products/${product.id}`} aria-label={`View ${product.name}`}><ProductArt art={product.art} /></Link>
          <div className="cart-line-info"><h2><Link href={`/products/${product.id}`}>{product.name}</Link></h2><p className="cart-color">{item.color}</p><p className="price">{money(item.unitPrice)} <span className="unit-label">each</span></p><Quantity value={item.quantity} label={label} onChange={(value) => update((current) => changeQuantity(current, item.productId, item.color, value))} /><button type="button" className="remove-line" aria-label={`Remove ${label}`} onClick={() => {
            update((current) => removeItem(current, item.productId, item.color));
            notify(`${product.name} removed from your bag`);
          }}>Remove</button></div>
          <p className="price cart-line-total" data-testid="line-total">{money(lineTotal(item))}</p>
        </article>;
      })}</div>
      <aside className="cart-sidebar" aria-label="Bag summary">
        <div className="coupon-panel">{state.coupon ? <div className="applied-coupon"><p>DESK15 applied</p><button type="button" className="text-link" onClick={() => {
          update(removeCoupon);
          setError(undefined);
        }}>Remove coupon</button></div> : <form onSubmit={submitCoupon}><label htmlFor="discount-code">Discount code</label><div className="coupon-input"><input id="discount-code" name="discount-code" value={code} onChange={(event) => { setCode(event.target.value); setError(undefined); }} aria-invalid={!!error} aria-describedby={error ? "coupon-error" : undefined} /><button type="submit">Apply</button></div>{error && <p id="coupon-error" className="coupon-error" role="alert">{error}</p>}</form>}</div>
        <OrderSummary state={state} />
        <Link className="primary-button checkout-link" href="/checkout">On to checkout <ArrowRight size={18} aria-hidden="true" /></Link><p className="checkout-note">Simulated checkout. No payment required.</p>
      </aside>
    </div>}
  </main>;
}
