"use client";

import Link from "next/link";
import { ArrowUpRight, Heart, Plus, Star } from "lucide-react";
import { money, type Product } from "../lib/catalog";
import { addItem, toggleWishlist } from "../lib/store";
import { swatchToken } from "../lib/browse";
import { ProductArt } from "./product-art";
import { useStore } from "./store-provider";

export function ProductCard({ product }: { product: Product }) {
  const { state, update, notify } = useStore();
  const saved = state.wishlist.includes(product.id);
  return (
    <article className="product-card" aria-label={product.name}>
      <div className="product-visual">
        <Link href={`/products/${product.id}`} className="art-link" aria-label={`View ${product.name}`}><ProductArt art={product.art} /></Link>
        {(!product.inStock || product.badge) && <span className={`badge ${!product.inStock ? "badge-muted" : ""}`}>{product.inStock ? product.badge : "Back soon"}</span>}
        <button className="save-button" aria-pressed={saved} aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`} onClick={() => {
          update((current) => toggleWishlist(current, product.id));
          notify(saved ? "Removed from your wishlist" : "Saved for a little later");
        }}><Heart size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" /></button>
      </div>
      <div className="product-heading"><h3><Link href={`/products/${product.id}`}>{product.name}</Link></h3><span className="price">{money(product.price)}</span></div>
      <p className="product-subtitle">{product.subtitle}</p>
      <div className="product-meta"><div className="swatches" role="group" aria-label={`${product.name} colors`}>{product.colors.map((color) => <span key={color.name} className="swatch" role="img" title={color.name} aria-label={color.name} style={{ backgroundColor: swatchToken(color.name) }} />)}</div><span className="rating"><Star size={12} fill="currentColor" aria-hidden="true" />{product.rating}<span className="sr-only"> out of 5 stars</span></span></div>
      {product.inStock ? <button className="quick-add" aria-label={`Add ${product.name} to bag`} onClick={() => {
        update((current) => addItem(current, product, product.colors[0].name, 1));
        notify(`${product.name} added to your bag`);
      }}>Add to bag <Plus size={16} aria-hidden="true" /></button> : <Link className="quick-add" href={`/products/${product.id}`}>View details <ArrowUpRight size={16} aria-hidden="true" /></Link>}
    </article>
  );
}
