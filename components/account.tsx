"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { demoAccount, signIn, signOut } from "../lib/store";
import { useStore } from "./store-provider";

export function Account() {
  const { state, ready, update, notify } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  if (!ready) return <main className="loading-state wrap"><p>Getting things ready…</p></main>;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = signIn(state, email, password);
    setError(result.error);
    if (result.error) return;
    update((current) => signIn(current, email, password).state);
    setPassword("");
    notify("Welcome back, Alex. Make yourself at home.");
    const next = params.get("next");
    if (next === "wishlist" || next === "checkout") router.push(`/${next}`);
  }

  return <main className="account-page wrap">
    {state.user ? <>
      <header className="commerce-heading"><p className="eyebrow">YOUR OWN LITTLE CORNER</p><h1>Good to see you, Alex.</h1><p>{state.user.email}</p></header>
      <nav className="account-links" aria-label="Your account"><Link className="text-link" href="/orders">Your orders</Link><Link className="text-link" href="/wishlist">Your wishlist</Link><Link className="text-link" href="/demo">Reset demo</Link></nav>
      <button className="primary-button" type="button" onClick={() => { update(signOut); notify("You’ve signed out. See you soon."); }}>Sign out</button>
    </> : <>
      <header className="account-heading"><p className="eyebrow">WELCOME TO YOUR LITTLE CORNER</p><h2>Make yourself at home.</h2></header>
      <div className="account-layout">
        <form className="account-form" onSubmit={submit}>
          <div className="account-field"><label htmlFor="account-email">Email address</label><input id="account-email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="account-field"><label htmlFor="account-password">Password</label><input id="account-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit">Sign in</button>
        </form>
        <aside className="demo-account"><h3>TAKE THE DEMO FOR A SPIN</h3><p className="demo-credential">{demoAccount.email}</p><p className="demo-credential">{demoAccount.password}</p><p>Demo account only. Use these sample credentials. This is not real authentication.</p></aside>
      </div>
    </>}
  </main>;
}
