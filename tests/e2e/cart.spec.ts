import { test, expect, type Page } from "@playwright/test";

const lamp = "Arc desk lamp";
const organizer = "Tidy desk organizer";
const line = (page: Page, color = "Terracotta", name = lamp) => page.getByRole("article", { name: `${name} (${color})`, exact: true });
const bag = (page: Page) => page.getByRole("link", { name: /^Shopping bag, \d+ items$/ });

async function browseTo(page: Page, name: string) {
  await page.getByRole("link", { name: "DeskDrop home", exact: true }).click();
  await page.getByRole("article", { name, exact: true }).getByRole("heading").getByRole("link").click();
}
async function addLamp(page: Page) {
  await page.goto("/products/arc-desk-lamp");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
}
async function discountedBag(page: Page) {
  await addLamp(page);
  await browseTo(page, organizer);
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await bag(page).click();
  await page.getByRole("textbox", { name: "Discount code", exact: true }).fill("desk15");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
}

test("rule 1: chosen colors remain separate and repeated colors merge", async ({ page }) => {
  await page.goto("/products/arc-desk-lamp");
  await page.getByRole("button", { name: "Select Sage", exact: true }).click();
  await expect(page.getByRole("button", { name: "Select Sage", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Arc desk lamp added to your bag");
  await page.getByRole("link", { name: "In your bag. Take a look", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(line(page, "Sage").getByText("Sage", { exact: true })).toBeVisible();
  await line(page, "Sage").getByRole("link", { name: lamp, exact: true }).click();
  await page.getByRole("button", { name: "Select Terracotta", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await bag(page).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(line(page)).toBeVisible();
  await expect(line(page, "Sage")).toBeVisible();
  await expect(bag(page)).toHaveAccessibleName("Shopping bag, 2 items");
  await line(page).getByRole("link", { name: lamp, exact: true }).click();
  await page.getByRole("button", { name: "Select Terracotta", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await bag(page).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(line(page).getByTestId("quantity")).toHaveText("2");
});

test("rule 2: quantities recompute totals and enforce both bounds", async ({ page }) => {
  await addLamp(page);
  await bag(page).click();
  const row = line(page);
  const increase = row.getByRole("button", { name: /Increase quantity/ });
  const decrease = row.getByRole("button", { name: /Decrease quantity/ });
  await expect(decrease).toBeDisabled();
  await increase.click();
  await increase.click();
  await expect(row.getByTestId("line-total")).toHaveText("$204");
  await expect(page.getByTestId("subtotal")).toHaveText("$204");
  await expect(page.getByRole("heading", { name: "Your bag", exact: false })).toContainText("3");
  for (let i = 3; i < 10; i++) await increase.click();
  await expect(increase).toBeDisabled();
  await expect(row.getByTestId("line-total")).toHaveText("$680");
  for (let i = 10; i > 1; i--) await decrease.click();
  await expect(decrease).toBeDisabled();
  await expect(page.getByTestId("subtotal")).toHaveText("$68");
});

test("rule 2: changing or removing one color leaves the other intact", async ({ page }) => {
  await addLamp(page);
  await page.getByRole("button", { name: "Select Sage", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await bag(page).click();
  const terracotta = page.getByRole("article").filter({ has: page.getByText("Terracotta", { exact: true }) });
  const sage = page.getByRole("article").filter({ has: page.getByText("Sage", { exact: true }) });
  await sage.getByRole("button", { name: /Increase quantity/ }).click();
  await sage.getByRole("button", { name: /Increase quantity/ }).click();
  await expect(sage.getByTestId("quantity")).toHaveText("3");
  await expect(sage.getByTestId("line-total")).toHaveText("$204");
  await expect(terracotta.getByTestId("quantity")).toHaveText("1");
  await expect(terracotta.getByTestId("line-total")).toHaveText("$68");
  await expect(page.getByTestId("subtotal")).toHaveText("$272");
  await sage.getByRole("button", { name: /Decrease quantity/ }).click();
  await expect(sage.getByTestId("quantity")).toHaveText("2");
  await expect(sage.getByTestId("line-total")).toHaveText("$136");
  await expect(terracotta.getByTestId("quantity")).toHaveText("1");
  await expect(terracotta.getByTestId("line-total")).toHaveText("$68");
  await sage.getByRole("button", { name: "Remove Arc desk lamp (Sage)", exact: true }).click();
  await expect(sage).toHaveCount(0);
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(terracotta.getByTestId("quantity")).toHaveText("1");
  await expect(terracotta.getByTestId("line-total")).toHaveText("$68");
  await expect(page.getByTestId("subtotal")).toHaveText("$68");
  await expect(page.getByRole("status").filter({ hasText: "Arc desk lamp removed from your bag" })).toBeVisible();
});

test("rule 3: lowercase coupon applies at $100 and removal below threshold is explained", async ({ page }) => {
  await discountedBag(page);
  await expect(page.getByTestId("subtotal")).toHaveText("$100");
  await expect(page.getByTestId("discount")).toHaveText("−$15");
  await expect(page.getByTestId("total")).toHaveText("$85");
  await expect(page.getByRole("status").filter({ hasText: "A little treat: 15% off applied." })).toBeVisible();
  await page.getByRole("button", { name: "Remove Tidy desk organizer (Natural oak)", exact: true }).click();
  await expect(page.getByText("DESK15 applied", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("discount")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "DESK15 was removed because your subtotal dropped below $100." })).toBeVisible();
  await expect(page.getByTestId("total")).toHaveText("$68");
  await line(page).getByRole("button", { name: /Increase quantity/ }).click();
  await expect(page.getByText("DESK15 was removed because your subtotal dropped below $100.", { exact: true })).toHaveCount(0);
});

test("coupon errors explain invalid codes and minimum subtotal", async ({ page }) => {
  await addLamp(page);
  await bag(page).click();
  const input = page.getByRole("textbox", { name: "Discount code", exact: true });
  await input.fill("NOPE");
  await input.press("Enter");
  await expect(page.getByRole("complementary", { name: "Bag summary", exact: true }).getByRole("alert")).toHaveText("That code isn't valid.");
  await input.fill("DESK15");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Bag summary", exact: true }).getByRole("alert")).toHaveText("DESK15 needs a subtotal of at least $100.");
  await expect(page.getByTestId("total")).toHaveText("$68");
});

test("remove coupon restores subtotal and standard shipping is free", async ({ page }) => {
  await discountedBag(page);
  await expect(page.getByText("DESK15 applied", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove coupon", exact: true }).click();
  await expect(page.getByTestId("discount")).toHaveCount(0);
  await expect(page.getByTestId("total")).toHaveText("$100");
  await expect(page.getByTestId("subtotal")).toHaveText("$100");
  await expect(page.getByTestId("shipping")).toHaveText("Free");
  await expect(page.getByRole("link", { name: "On to checkout", exact: true })).toHaveAttribute("href", "/checkout");
  await expect(page.getByText("Simulated checkout. No payment required.", { exact: true })).toBeVisible();
});

test("empty bag links back to the collection and removing the last item empties it", async ({ page }) => {
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Room for something good.", exact: true })).toBeVisible();
  await expect(page.getByText("Your bag is empty. Let’s find something that feels like you.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Find your next favorite", exact: true }).click();
  await expect(page).toHaveURL("/");
  await browseTo(page, lamp);
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await bag(page).click();
  await page.getByRole("button", { name: "Remove Arc desk lamp (Terracotta)", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Room for something good.", exact: true })).toBeVisible();
  await expect(bag(page)).toHaveAccessibleName("Shopping bag, 0 items");
});

test("product detail has metadata, content, quantity selection, wishlist and related links", async ({ page }) => {
  await page.goto("/products/arc-desk-lamp");
  await expect(page).toHaveTitle(lamp);
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb", exact: true });
  await expect(breadcrumb.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/");
  await expect(breadcrumb.getByRole("link", { name: "The collection", exact: true })).toHaveAttribute("href", "/#collection");
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(lamp);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(lamp);
  await expect(page.getByText("Warm, dimmable LED light", { exact: true })).toBeVisible();
  await expect(page.getByText("In stock and ready for your desk", { exact: true })).toBeVisible();
  const colors = page.getByRole("group", { name: "Color", exact: true });
  await expect(colors.getByRole("button", { name: "Select Terracotta", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(colors.getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: `Decrease quantity of ${lamp}`, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: `Increase quantity of ${lamp}`, exact: true }).click();
  const save = page.getByRole("button", { name: "Save to wishlist", exact: true });
  await save.click();
  await expect(page.getByRole("button", { name: "Remove from wishlist", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "Wishlist, 1 items", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove from wishlist", exact: true }).click();
  await expect(save).toHaveAttribute("aria-pressed", "false");
  const related = page.getByRole("region", { name: "A few more desk companions.", exact: true });
  await expect(related.getByRole("article")).toHaveCount(4);
  await expect(related.getByRole("link", { name: `View ${lamp}`, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("link", { name: "In your bag. Take a look", exact: true }).click();
  await expect(line(page).getByTestId("quantity")).toHaveText("2");
});

test("out of stock product cannot be added", async ({ page }) => {
  await page.goto("/products/slow-time-clock");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Slow time clock");
  await expect(page.getByRole("button", { name: "Back soon", exact: true })).toBeDisabled();
  await expect(page.getByText("Taking a little break. Check back soon.", { exact: true })).toBeVisible();
});

test("unknown product slug returns HTTP 404 and the existing recovery page", async ({ page }) => {
  const response = await page.goto("/products/nope");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This one wandered off.", exact: true })).toBeVisible();
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`detail and populated cart fit 375x812 in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 375, height: 812 });
    await addLamp(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await bag(page).click();
    await expect(line(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}
