"use client";

import Link from "next/link";
import { ProductCard } from "../../components/product-card";
import { useStore } from "../../components/store-provider";
import { productById } from "../../lib/catalog";

export default function WishlistPage() {
  const { state, ready } = useStore();
  if (!ready) return <main className="loading-state wrap"><p>Getting things ready…</p></main>;
  return <main className="wishlist-page wrap">
    <header className="commerce-heading"><p className="eyebrow">FOR NOW. FOR LATER. FOR YOU.</p><h1>Your little wishlist.</h1></header>
    {state.wishlist.length === 0 ? <section className="commerce-empty"><h2>Save a little inspiration.</h2><p>Tap the heart on anything you love. You’ll find it right here.</p></section> : <>
      {!state.user && <p className="wishlist-sign-in">Keep your favorites close. <Link className="text-link" href="/account?next=wishlist">Sign in to your account.</Link></p>}
      <div className="product-grid">{state.wishlist.map((id) => {
        const product = productById(id);
        return product ? <ProductCard key={id} product={product} /> : null;
      })}</div>
    </>}
  </main>;
}
