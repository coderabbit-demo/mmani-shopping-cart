"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "../../components/store-provider";

export default function DemoPage() {
  const { reset, ready } = useStore();
  const [confirm, setConfirm] = useState(false);
  if (!ready) return <main className="loading-state wrap"><p>Getting things ready…</p></main>;
  return <main className="demo-page wrap">
    <header className="commerce-heading"><p className="eyebrow">A FRESH START</p><h1>Make room for another good day.</h1><p>Clear your bag, wishlist, account, coupons, and orders from this browser.</p></header>
    {confirm ? <section className="reset-confirmation" aria-labelledby="reset-question"><h2 id="reset-question">Clear all demo data in this browser?</h2><div className="reset-actions"><button className="primary-button" type="button" onClick={() => { reset(); setConfirm(false); }}>Yes, start fresh</button><button className="text-link" type="button" onClick={() => setConfirm(false)}>Keep my data</button></div></section> : <button className="primary-button" type="button" onClick={() => setConfirm(true)}>Reset demo</button>}
    <p className="demo-back"><Link className="text-link" href="/">Back to the storefront</Link></p>
  </main>;
}
