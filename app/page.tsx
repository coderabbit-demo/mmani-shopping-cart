import { categories, type Category } from "../lib/catalog";
import { Shop } from "../components/shop";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const requestedCategory = first(params.category);
  const category = categories.includes(requestedCategory as Category) ? requestedCategory as Category : "All objects";
  const query = (first(params.q) ?? "").trim();
  const newOnly = first(params.new) === "1";
  return <Shop category={category} query={query} newOnly={newOnly} />;
}
