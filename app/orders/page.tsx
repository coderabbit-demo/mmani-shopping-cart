"use client";

import Link from "next/link";
import { Breadcrumb } from "../../components/commerce";
import { OrderReceipt } from "../../components/receipt";
import { useStore } from "../../components/store-provider";

export default function OrdersPage() {
  const { state, ready } = useStore();
  if (!ready) return <main className="loading-state wrap"><p>Getting things ready…</p></main>;
  return <main className="orders-page wrap">
    <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Your orders" }]} />
    <header className="commerce-heading"><p className="eyebrow">GOOD THINGS, ON THEIR WAY</p><h1>Your orders.</h1></header>
    {state.orders.length === 0 ? <section className="commerce-empty"><h2>Your story starts here.</h2><Link className="primary-button" href="/">Explore the collection</Link></section> : <div className="orders-list">{state.orders.map((order) => <OrderReceipt key={order.id} order={order} />)}</div>}
  </main>;
}
