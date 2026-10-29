"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, Star, ArrowRight } from "lucide-react";
import { money, products, type Product } from "../lib/catalog";
import { addItem, toggleWishlist } from "../lib/store";
import { swatchToken } from "../lib/browse";
import { useStore } from "./store-provider";
import { ProductArt } from "./product-art";
import { ProductCard } from "./product-card";
import { Breadcrumb, Quantity } from "./commerce";

export function ProductDetail({ product }: { product: Product }) {
  const { state, update, notify } = useStore();
  const [color, setColor] = useState(product.colors[0].name);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const saved = state.wishlist.includes(product.id);
  const related = products.filter((other) => other.id !== product.id).slice(0, 4);
  return <main className="product-detail wrap">
    <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "The collection", href: "/#collection" }, { label: product.name }]} />
    <div className="detail-layout">
      <div className="detail-art"><ProductArt art={product.art} /></div>
      <div className="detail-info">
        <p className="eyebrow">{product.category}</p>
        <h1>{product.name}</h1>
        <p className="detail-subtitle">{product.subtitle}</p>
        <p className="rating"><Star size={16} fill="currentColor" aria-hidden="true" />{product.rating}<span className="sr-only"> out of 5 stars</span></p>
        <p className="detail-price price">{money(product.price)}</p>
        <p className="detail-description">{product.description}</p>
        <fieldset className="color-selector"><legend>Color</legend><p className="selected-color">{color}</p><div className="color-options">{product.colors.map((option) => <button type="button" key={option.name} aria-label={`Select ${option.name}`} aria-pressed={color === option.name} onClick={() => setColor(option.name)}><span className="color-swatch" style={{ backgroundColor: swatchToken(option.name) }} /><span>{option.name}</span></button>)}</div></fieldset>
        <div className="detail-purchase"><Quantity value={quantity} onChange={setQuantity} label={product.name} /><button type="button" className="primary-button" disabled={!product.inStock} onClick={() => {
          const room = 10 - (state.cart.find((item) => item.productId === product.id && item.color === color)?.quantity ?? 0);
          if (room === 0) {
            notify(`Your bag already holds the maximum of 10 ${product.name} (${color}).`);
          } else {
            update((current) => addItem(current, product, color, Math.min(quantity, room)));
            notify(room < quantity
              ? `Only ${room} more fit. Your bag now holds 10 ${product.name} (${color}).`
              : `${product.name} added to your bag`);
          }
          setAdded(true);
        }}>{product.inStock ? "Add to bag" : "Back soon"}<ArrowRight size={18} aria-hidden="true" /></button></div>
        <p className={`stock-note ${product.inStock ? "in-stock" : ""}`}>{product.inStock ? "In stock and ready for your desk" : "Taking a little break. Check back soon."}</p>
        {added && <Link className="text-link bag-confirmation" href="/cart">In your bag. Take a look <ArrowRight size={16} aria-hidden="true" /></Link>}
        <button type="button" className="detail-save" aria-pressed={saved} onClick={() => {
          update((current) => toggleWishlist(current, product.id));
          notify(saved ? "Removed from your wishlist" : "Saved for a little later");
        }}><Heart size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />{saved ? "Remove from wishlist" : "Save to wishlist"}</button>
        <section className="thoughtful-details"><h2>The thoughtful details</h2><ul>{product.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></section>
      </div>
    </div>
    <section className="related-products" aria-labelledby="related-heading"><h2 id="related-heading">A few more desk companions.</h2><div className="product-grid">{related.map((other) => <ProductCard key={other.id} product={other} />)}</div></section>
  </main>;
}
