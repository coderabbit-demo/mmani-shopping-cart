"use client";

import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { money } from "../lib/catalog";
import { totals, type StoreState } from "../lib/store";

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return <nav className="breadcrumb" aria-label="Breadcrumb"><ol>{items.map((item, index) => <li key={`${index}:${item.label}`}>
    {index > 0 && <span aria-hidden="true">›</span>}
    {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
  </li>)}</ol></nav>;
}

export function Quantity({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return <div className="quantity" role="group" aria-label={`Quantity of ${label}`}>
    <button type="button" aria-label={`Decrease quantity of ${label}`} disabled={value <= 1} onClick={() => onChange(value - 1)}><Minus size={16} aria-hidden="true" /></button>
    <span data-testid="quantity" aria-live="polite" aria-atomic="true">{value}</span>
    <button type="button" aria-label={`Increase quantity of ${label}`} disabled={value >= 10} onClick={() => onChange(value + 1)}><Plus size={16} aria-hidden="true" /></button>
  </div>;
}

export function OrderSummary({ state }: { state: StoreState }) {
  const amounts = totals(state);
  return <section className="order-summary" aria-label="Order summary"><dl>
    <div><dt>Subtotal</dt><dd data-testid="subtotal">{money(amounts.subtotal)}</dd></div>
    <div><dt>Shipping{state.delivery === "express" && <span className="delivery-label">Express</span>}</dt><dd data-testid="shipping">{state.delivery === "standard" ? "Free" : money(amounts.shipping)}</dd></div>
    {state.coupon && <div className="discount-row"><dt>DESK15 (15% off)</dt><dd data-testid="discount">−{money(amounts.discount)}</dd></div>}
    <div className="summary-total"><dt>Total</dt><dd data-testid="total">{money(amounts.total)}</dd></div>
  </dl></section>;
}
