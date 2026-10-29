import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function NotFound() {
  return <main className="not-found wrap"><p className="eyebrow">404 · A LITTLE OUT OF PLACE</p><h1>This one wandered off.</h1><p>Let’s get you back to something good.</p><Link className="primary-button" href="/">Back to the collection <ArrowRight size={18} aria-hidden="true" /></Link></main>;
}
