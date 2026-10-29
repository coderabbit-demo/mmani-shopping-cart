import Link from "next/link";
import { money, productById } from "../lib/catalog";
import { lineTotal, type Order } from "../lib/store";

export function OrderReceipt({ order, confirmation = false }: { order: Order; confirmation?: boolean }) {
  return <article className="order-receipt" aria-label={`Order ${order.id}`}>
    <header className="receipt-header"><div><h2>ORDER {order.id}</h2><time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></div><span className="receipt-status">{confirmation ? "Confirmed" : "Processing"}</span></header>
    <ul className="receipt-items">{order.items.map((item) => {
      const product = productById(item.productId)!;
      return <li key={`${item.productId}:${item.color}`}><div><Link href={`/products/${product.id}`}>{product.name}</Link><p>{item.color} · Qty {item.quantity}</p></div><span className="price">{money(lineTotal(item))}</span></li>;
    })}</ul>
    <div className="receipt-details"><section><h3>DELIVER TO</h3><address><span>{order.address.name}</span><span>{order.address.street}</span><span>{order.address.city}</span><span>{order.address.postal}</span><span>{order.address.country}</span></address></section><section><h3>DELIVERY</h3><p>{order.delivery === "express" ? "Express · 1–2 business days" : "Standard · 4–6 business days"}</p><p>{order.address.email}</p></section></div>
    <dl className="receipt-totals"><div><dt>Subtotal</dt><dd data-testid="receipt-subtotal">{money(order.subtotal)}</dd></div>{order.discount > 0 && <div className="discount-row"><dt>Discount</dt><dd data-testid="receipt-discount">−{money(order.discount)}</dd></div>}<div><dt>Shipping</dt><dd data-testid="receipt-shipping">{order.shipping === 0 ? "Free" : money(order.shipping)}</dd></div><div className="receipt-total"><dt>Total</dt><dd data-testid="receipt-total">{money(order.total)}</dd></div></dl>
  </article>;
}
