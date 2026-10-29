"use client";

import { Suspense } from "react";
import { Account } from "../../components/account";

export default function AccountPage() {
  return <Suspense fallback={<main className="loading-state wrap"><p>Getting things ready…</p></main>}><Account /></Suspense>;
}
