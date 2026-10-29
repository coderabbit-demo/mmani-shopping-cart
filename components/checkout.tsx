"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { placeOrder, setDelivery, type Address } from "../lib/store";
import { Breadcrumb, OrderSummary } from "./commerce";
import { useStore } from "./store-provider";

type Field = "email" | "name" | "street" | "city" | "postal";
const fields: Record<Field, { label: string; autoComplete: string; maxLength: number; error: string }> = {
  email: { label: "Email address", autoComplete: "email", maxLength: 254, error: "Enter your email address." },
  name: { label: "Full name", autoComplete: "name", maxLength: 100, error: "Enter your full name." },
  street: { label: "Street address", autoComplete: "street-address", maxLength: 200, error: "Enter your street address." },
  city: { label: "City", autoComplete: "address-level2", maxLength: 100, error: "Enter your city." },
  postal: { label: "ZIP / postal code", autoComplete: "postal-code", maxLength: 20, error: "Enter your ZIP or postal code." },
};

function fieldError(key: Field, value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return fields[key].error;
  if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email address.";
}

export function Checkout() {
  const { state, update } = useStore();
  const router = useRouter();
  const submitted = useRef(false);
  const erroredFields = useRef(new Set<Field>());
  const [pending, setPending] = useState(false);
  const [values, setValues] = useState<Address>(() => ({ email: state.user?.email ?? "", name: state.user?.name ?? "", street: "", city: "", postal: "", country: "United States" }));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  function field(key: Field) {
    const options = fields[key];
    return <div className="checkout-field" key={key}>
      <label htmlFor={`checkout-${key}`}>{options.label}</label>
      <input id={`checkout-${key}`} name={key} type={key === "email" ? "email" : "text"} autoComplete={options.autoComplete} maxLength={options.maxLength} required value={values[key]} onChange={(event) => {
        const value = event.target.value;
        setValues((current) => ({ ...current, [key]: value }));
        if (erroredFields.current.has(key)) setErrors((current) => ({ ...current, [key]: fieldError(key, value) }));
      }} aria-invalid={errors[key] ? "true" : undefined} aria-describedby={errors[key] ? `checkout-${key}-error` : undefined} />
      {errors[key] && <p className="field-error" id={`checkout-${key}-error`}>{errors[key]}</p>}
    </div>;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitted.current || state.cart.length === 0) return;
    const address: Address = { name: values.name.trim(), email: values.email.trim(), street: values.street.trim(), city: values.city.trim(), postal: values.postal.trim(), country: values.country.trim() };
    const nextErrors: Partial<Record<Field, string>> = {};
    for (const key of Object.keys(fields) as Field[]) {
      const error = fieldError(key, address[key]);
      if (error) {
        nextErrors[key] = error;
        erroredFields.current.add(key);
      }
    }
    setErrors(nextErrors);
    const firstInvalid = (Object.keys(fields) as Field[]).find((key) => nextErrors[key]);
    if (firstInvalid) {
      event.currentTarget.querySelector<HTMLInputElement>(`#checkout-${firstInvalid}`)?.focus();
      return;
    }
    submitted.current = true;
    setPending(true);
    const id = `DD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const createdAt = new Date().toISOString();
    update((current) => placeOrder(current, address, id, createdAt));
    router.push("/checkout/success");
  }

  return <main className="checkout-page wrap">
    <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Your bag", href: "/cart" }, { label: "Checkout" }]} />
    <header className="commerce-heading"><p className="eyebrow">ALMOST AT YOUR DESK</p><h1>Make it yours.</h1><p>Just a few details, and we’ll take it from here.</p></header>
    {state.cart.length === 0 ? <section className="commerce-empty"><ShoppingBag size={36} aria-hidden="true" /><h2>Your bag needs a little something.</h2><p>Add an object to your bag before checking out.</p><Link className="primary-button" href="/">Explore the collection <ArrowRight size={18} aria-hidden="true" /></Link></section> : <form className="checkout-layout" noValidate onSubmit={submit}>
      <div className="checkout-sections">
        <fieldset><legend>Your details</legend>{field("email")}{field("name")}</fieldset>
        <fieldset><legend>Your happy place</legend>{field("street")}<div className="checkout-field-pair">{field("city")}{field("postal")}</div><div className="checkout-field"><label htmlFor="checkout-country">Country</label><select id="checkout-country" name="country" autoComplete="country-name" required value={values.country} onChange={(event) => setValues((current) => ({ ...current, country: event.target.value }))}>{["United States", "United Kingdom", "Canada", "India", "Australia"].map((country) => <option key={country}>{country}</option>)}</select></div></fieldset>
        <fieldset className="delivery-options"><legend>The journey to you</legend>
          <label><input type="radio" name="delivery" value="standard" checked={state.delivery === "standard"} onChange={() => update((current) => setDelivery(current, "standard"))} /><span>Standard delivery · 4–6 business days · Free</span></label>
          <label><input type="radio" name="delivery" value="express" checked={state.delivery === "express"} onChange={() => update((current) => setDelivery(current, "express"))} /><span>Express delivery · 1–2 business days · $12</span></label>
        </fieldset>
        <fieldset className="demo-payment"><legend>A practice payment</legend><p>Demo payment •••• 4242</p><p>This is a test store. No card details or real payment needed.</p></fieldset>
      </div>
      <aside className="checkout-summary" aria-label="Checkout summary"><OrderSummary state={state} showLines /><p className="checkout-note">Your details stay in this browser. Use a fictional address for your demo.</p><button className="primary-button checkout-link" type="submit" disabled={pending}>Place demo order <ArrowRight size={18} aria-hidden="true" /></button></aside>
    </form>}
  </main>;
}
