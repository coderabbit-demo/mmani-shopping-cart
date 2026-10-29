import { test, expect } from "@playwright/test";
import { products } from "../../lib/catalog";

const cards = (page: import("@playwright/test").Page) => page.getByRole("article");

test("header search submits q and displays matching cards", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search products" }).fill("lamp");
  await page.getByRole("searchbox").press("Enter");
  await expect(page).toHaveURL(/\?q=lamp$/);
  await expect(page.getByRole("heading", { name: "Results for “lamp”", exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toHaveAttribute("aria-label", "Arc desk lamp");
});

test("an unmatched search shows the empty state", async ({ page }) => {
  await page.goto("/?q=unfindable-object");
  await expect(page.getByRole("heading", { name: "No objects found." })).toBeVisible();
  await expect(page.getByText("Try another search or give your filters a little more room.")).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await page.getByRole("link", { name: "Explore all objects", exact: true }).click();
  await expect(cards(page)).toHaveCount(8);
});

test("HTML-shaped queries are literal text", async ({ page }) => {
  await page.goto("/?q=%3Cb%3Emarker%3C%2Fb%3E");
  await expect(page.getByRole("heading", { name: "Results for “<b>marker</b>”", exact: true })).toBeVisible();
  await expect(page.locator("b")).toHaveCount(0);
});

test("Lighting category updates cards and singular results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Lighting", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lighting", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toHaveAttribute("aria-label", "Arc desk lamp");
  await expect(page.getByText("1 thoughtful object", { exact: true })).toBeVisible();
});

test("stock filter removes the unavailable clock and restores it", async ({ page }) => {
  await page.goto("/");
  const clock = page.getByRole("article", { name: "Slow time clock", exact: true });
  await expect(clock.getByText("Back soon")).toBeVisible();
  await expect(clock.getByRole("button", { name: /Add .* to bag/ })).toHaveCount(0);
  await expect(clock.getByRole("link", { name: "View details", exact: true })).toHaveAttribute("href", "/products/slow-time-clock");
  await page.getByRole("checkbox", { name: "In stock only" }).check();
  await expect(cards(page)).toHaveCount(7);
  await expect(clock).toHaveCount(0);
  await page.getByRole("checkbox", { name: "In stock only" }).uncheck();
  await expect(cards(page)).toHaveCount(8);
});

test("sorting keeps category, query and stock filter", async ({ page }) => {
  await page.goto("/?q=tech");
  await page.getByRole("button", { name: "Tech accessories", exact: true }).click();
  await page.getByRole("checkbox", { name: "In stock only" }).check();
  await page.getByRole("combobox", { name: "Sort products" }).selectOption("price-low");
  await expect(page.getByRole("button", { name: "Tech accessories", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("checkbox", { name: "In stock only" })).toBeChecked();
  await expect(page.getByRole("heading", { name: "Results for “tech”", exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).locator(".price")).toHaveText(["$94", "$129"]);
  await page.getByRole("combobox", { name: "Sort products" }).selectOption("price-high");
  await expect(cards(page).locator(".price")).toHaveText(["$129", "$94"]);
});

test("quick-add updates total quantity and announces repeated actions", async ({ page }) => {
  await page.goto("/");
  const add = page.getByRole("button", { name: "Add Arc desk lamp to bag", exact: true });
  await add.click();
  await expect(page.getByRole("link", { name: "Shopping bag, 1 items", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Arc desk lamp added to your bag");
  await add.click();
  await expect(page.getByRole("link", { name: "Shopping bag, 2 items", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Arc desk lamp added to your bag");
});

test("save and unsave update pressed state, count and announcement", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save Arc desk lamp to wishlist", exact: true }).click();
  const remove = page.getByRole("button", { name: "Remove Arc desk lamp from wishlist", exact: true });
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "Wishlist, 1 items", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved for a little later");
  await remove.click();
  await expect(page.getByRole("link", { name: "Wishlist, 0 items", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Removed from your wishlist");
});

test("missing route returns 404 and the branded recovery page", async ({ page }) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This one wandered off.", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the collection", exact: true })).toHaveAttribute("href", "/");
});

test("mobile fits and menu toggles, searches and closes on navigation", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(page.getByRole("button", { name: "Close menu", exact: true })).toHaveAttribute("aria-expanded", "true");
  for (const name of ["Shop all", "Desk essentials", "New arrivals", "My account"]) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(nav.getByRole("searchbox", { name: "Search products" })).toBeVisible();
  await page.getByRole("button", { name: "Close menu", exact: true }).click();
  await expect(nav).toHaveCount(0);
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await nav.getByRole("link", { name: "Desk essentials", exact: true }).click();
  await expect(nav).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Desk essentials", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("URL categories and new arrivals initialize and reset controls", async ({ page }) => {
  await page.goto("/?category=unknown");
  await expect(page.getByRole("button", { name: "All objects 8", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(cards(page)).toHaveCount(8);
  await page.getByRole("link", { name: "New arrivals", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fresh on the desk.", exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Your desk.", exact: false })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Sort products" }).selectOption("rating");
  await expect(cards(page)).toHaveCount(1);
  await page.getByRole("link", { name: "Shop all", exact: true }).click();
  await expect(cards(page)).toHaveCount(products.length);
});


test("tablet keeps header search available", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("searchbox", { name: "Search products" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("searchbox", { name: "Search products" }).fill("lamp");
  await page.getByRole("searchbox").press("Enter");
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Results for “lamp”", exact: true })).toBeVisible();
});

for (const mobile of [false, true]) {
  test(`regression: ${mobile ? "mobile" : "desktop"} search preserves bag and wishlist`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.getByRole("button", { name: "Add Arc desk lamp to bag", exact: true }).click();
    await page.getByRole("button", { name: "Save Arc desk lamp to wishlist", exact: true }).click();
    if (mobile) await page.getByRole("button", { name: "Open menu", exact: true }).click();
    const search = mobile
      ? page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("searchbox", { name: "Search products" })
      : page.getByRole("searchbox", { name: "Search products" });
    await search.fill("lamp");
    await search.press("Enter");
    await expect(page.getByRole("heading", { name: "Results for “lamp”", exact: true })).toBeVisible();
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Shopping bag, 1 items", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Wishlist, 1 items", exact: true })).toBeVisible();
  });
}

test("regression: empty-state recovery preserves bag and wishlist", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add Arc desk lamp to bag", exact: true }).click();
  await page.getByRole("button", { name: "Save Arc desk lamp to wishlist", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search products" }).fill("no-object-matches-this");
  await page.getByRole("searchbox").press("Enter");
  await expect(page.getByRole("heading", { name: "No objects found.", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Explore all objects", exact: true }).click();
  await expect(cards(page)).toHaveCount(8);
  await expect(page.getByRole("link", { name: "Shopping bag, 1 items", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Wishlist, 1 items", exact: true })).toBeVisible();
});

test("regression: Shop all resets a chosen category from the URL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Lighting", exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await page.getByRole("link", { name: "Shop all", exact: true }).click();
  await expect(cards(page)).toHaveCount(8);
  await expect(page.getByRole("button", { name: "All objects 8", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).searchParams.has("category")).toBe(false);
});

test("regression: category navigation retains q and new in the URL", async ({ page }) => {
  await page.goto("/?q=tech&new=1");
  await page.getByRole("button", { name: "Lighting", exact: true }).click();
  await expect(page).toHaveURL(/category=Lighting/);
  const params = new URL(page.url()).searchParams;
  expect(params.get("category")).toBe("Lighting");
  expect(params.get("q")).toBe("tech");
  expect(params.get("new")).toBe("1");
  await page.getByRole("combobox", { name: "Sort products" }).selectOption("price-low");
  await page.getByRole("checkbox", { name: "In stock only" }).check();
  await expect(page.getByRole("button", { name: "Lighting", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).searchParams.toString()).toBe(params.toString());
  await page.getByRole("button", { name: "All objects 8", exact: true }).click();
  await expect(page).not.toHaveURL(/category=/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("tech");
  expect(new URL(page.url()).searchParams.get("new")).toBe("1");
});

test("regression: swatches use tokens and retain catalog colors in both themes", async ({ page }) => {
  await page.goto("/");
  for (const colorScheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const product of products) {
      const card = page.getByRole("article", { name: product.name, exact: true });
      for (const color of product.colors) {
        const swatch = card.getByRole("img", { name: color.name, exact: true });
        const slug = color.name.toLowerCase().replaceAll(" ", "-");
        const channels = color.hex.slice(1).match(/.{2}/g)!.map((part) => parseInt(part, 16));
        await expect(swatch).toHaveCSS("background-color", `rgb(${channels.join(", ")})`);
        expect(await swatch.evaluate((element) => (element as HTMLElement).style.backgroundColor)).toBe(`var(--swatch-${slug})`);
      }
    }
  }
});
