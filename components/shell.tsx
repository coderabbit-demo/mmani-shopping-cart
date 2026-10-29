"use client";

import Link from "next/link";
import { useState } from "react";
import { Heart, Menu, Search, ShoppingBag, UserRound, X, ArrowUpRight } from "lucide-react";
import { useStore } from "./store-provider";

const navigation = [
  { label: "Shop all", href: "/" },
  { label: "Desk essentials", href: "/?category=Desk%20essentials" },
  { label: "New arrivals", href: "/?new=1" },
];

function SearchForm({ mobile = false }: { mobile?: boolean }) {
  const id = mobile ? "mobile-search" : "header-search";
  return (
    <form action="/" method="get" className="search-form" role="search">
      <label className="sr-only" htmlFor={id}>Search products</label>
      <input id={id} name="q" type="search" placeholder="Find your next favorite" />
      <button type="submit" aria-label="Search"><Search size={18} aria-hidden="true" /></button>
    </form>
  );
}

export function Header() {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const quantity = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <header className="site-header">
      <div className="header-inner wrap">
        <Link className="wordmark" href="/" aria-label="DeskDrop home">DeskDrop<span aria-hidden="true">.</span></Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map(({ href, label }) => <Link key={label} href={href}>{label}</Link>)}
        </nav>
        <div className="desktop-search"><SearchForm /></div>
        <div className="header-actions">
          <Link className="icon-link" href="/wishlist" aria-label={`Wishlist, ${state.wishlist.length} items`}>
            <Heart size={20} aria-hidden="true" /><span className="count">{state.wishlist.length}</span>
          </Link>
          <Link className="icon-link account-link" href="/account" aria-label="My account"><UserRound size={20} aria-hidden="true" /></Link>
          <Link className="icon-link" href="/cart" aria-label={`Shopping bag, ${quantity} items`}>
            <ShoppingBag size={20} aria-hidden="true" /><span className="count">{quantity}</span>
          </Link>
          <button className="menu-toggle icon-link" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && <nav id="mobile-navigation" className="mobile-nav wrap" aria-label="Mobile navigation">
        {navigation.map(({ href, label }) => <Link onClick={() => setOpen(false)} key={label} href={href}>{label}</Link>)}
        <Link href="/account" onClick={() => setOpen(false)}>My account</Link>
        <SearchForm mobile />
      </nav>}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main wrap">
        <div><Link className="wordmark" href="/">DeskDrop<span aria-hidden="true">.</span></Link><p>Thoughtful objects. A better place to do your thing.</p></div>
        <nav aria-label="Footer navigation"><Link href="/">Explore the collection <ArrowUpRight size={16} aria-hidden="true" /></Link><Link href="/orders">Your orders <ArrowUpRight size={16} aria-hidden="true" /></Link></nav>
      </div>
      <div className="footer-bottom wrap">
        <p>Demo storefront · No real payments or deliveries</p>
        <a className="brand-credit" href="https://www.coderabbit.ai" rel="noopener">Built with <picture>
          <source media="(prefers-color-scheme: light)" srcSet="/brand/orange-typemark.svg" />
          <img src="/brand/white-typemark.svg" alt="CodeRabbit" height="20" width="138" />
        </picture></a>
      </div>
    </footer>
  );
}
