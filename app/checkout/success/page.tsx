"use client";

import Link from "next/link";
import { OrderReceipt } from "../../../components/receipt";
import { useStore } from "../../../components/store-provider";

export default function SuccessPage() {
  const { state, ready } = useStore();
  if (!ready) return <main className="loading-state wrap"><p>Getting things ready…</p></main>;
  const order = state.lastOrder;
  if (!order) return <main className="success-page wrap"><section className="commerce-empty"><h1>Nothing on its way just yet.</h1><Link className="primary-button" href="/">Explore the collection</Link></section></main>;
  const firstName = order.address.name.split(/\s+/)[0];
  return <main className="success-page wrap">
    <header className="commerce-heading"><p className="eyebrow">A GOOD DAY JUST GOT BETTER</p><h1>Your desk says thanks.</h1><p>Order confirmed, {firstName}. Your new favorites are one step closer.</p><p className="demo-disclaimer">Demo order only · No payment taken, no email sent.</p></header>
    <OrderReceipt order={order} confirmation />
    <nav className="receipt-actions" aria-label="After your order"><Link className="primary-button" href="/orders">View order history</Link><Link className="text-link" href="/">Keep exploring</Link></nav>
  </main>;
}
