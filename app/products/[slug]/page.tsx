import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { products, productById } from "../../../lib/catalog";
import { ProductDetail } from "../../../components/product-detail";

type ProductPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.id }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const product = productById((await params).slug);
  if (!product) notFound();
  return { title: product.name };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = productById((await params).slug);
  if (!product) notFound();
  return <ProductDetail key={product.id} product={product} />;
}
