"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowRight, PackageCheck, Sparkles } from "lucide-react";
import { categories, products, type Category } from "../lib/catalog";
import { filterProducts, sortProducts } from "../lib/browse";
import { ProductArt } from "./product-art";
import { ProductCard } from "./product-card";

export function Shop({ category, query, newOnly }: { category: Category; query: string; newOnly: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  function selectCategory(value: Category) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "All objects") params.delete("category");
    else params.set("category", value);
    const search = params.toString();
    router.push(search ? `/?${search}` : "/", { scroll: false });
  }
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState("featured");
  const visible = sortProducts(filterProducts(products, { category, query, inStockOnly, newOnly }), sort);
  return (
    <main>
      {!query && !newOnly && <section className="hero wrap" aria-labelledby="hero-heading">
        <div className="hero-copy"><p className="eyebrow"><span className="eyebrow-dot" />MAKE SPACE FOR A GOOD DAY</p><h1 id="hero-heading">Your desk.<br />Your little<br /><span>happy place.</span></h1><p className="hero-description">Thoughtful essentials for the place where your best ideas happen.</p><a className="primary-button" href="#collection">Find your desk favorites <ArrowRight size={18} aria-hidden="true" /></a><p className="hero-note"><PackageCheck size={16} aria-hidden="true" /> Good objects. Everyday joy.</p></div>
        <div className="hero-art" aria-hidden="true"><div className="hero-art-orbit" /><div className="hero-lamp"><ProductArt art="lamp" /></div><div className="hero-keyboard"><ProductArt art="keyboard" /></div><div className="hero-plant"><ProductArt art="plant" /></div><span className="art-caption">A LITTLE LESS ORDINARY.</span><Sparkles className="hero-sparkle" size={30} /><span className="hero-object-label">Objects with a purpose.<br />And a little personality.</span></div>
        <a className="scroll-note" href="#collection">MEET YOUR DESK FAVORITES <ArrowDown size={14} aria-hidden="true" /></a>
      </section>}
      <section id="collection" className="collection wrap" aria-labelledby="collection-heading">
        <div className="collection-title"><div><p className="eyebrow">THE GOOD STUFF</p>{query || newOnly ? <h1 id="collection-heading">{query ? `Results for “${query}”` : "Fresh on the desk."}</h1> : <h2 id="collection-heading">A little something<br className="desktop-break" /> for your space.</h2>}</div><p>Small upgrades.<br />A whole new kind of everyday.</p></div>
        <div className="category-list" role="group" aria-label="Product categories">{categories.map((value) => <button key={value} aria-pressed={category === value} onClick={() => selectCategory(value)}>{value}{value === "All objects" && <span> {products.length}</span>}</button>)}</div>
        <div className="collection-toolbar"><p className="results-count">{visible.length} thoughtful {visible.length === 1 ? "object" : "objects"}</p><div className="filter-controls"><label className="stock-filter"><input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} />In stock only</label><label className="sort-label"><span className="sr-only">Sort products</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="rating">Top rated</option></select></label></div></div>
        {visible.length ? <div className="product-grid">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><Sparkles size={32} aria-hidden="true" /><h3>No objects found.</h3><p>Try another search or give your filters a little more room.</p><Link className="text-link" href="/">Explore all objects <ArrowRight size={16} aria-hidden="true" /></Link></div>}
      </section>
    </main>
  );
}
