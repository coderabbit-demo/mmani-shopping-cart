import { test, expect, type Page } from "@playwright/test";

const bag = (page: Page) => page.getByRole("link", { name: /^Shopping bag, \d+ items$/ });
const saved = (page: Page) => page.getByRole("link", { name: /^Wishlist, \d+ items$/ });
const receipt = (page: Page) => page.getByRole("article", { name: /^Order DD-/ });
async function addLamp(page: Page, quantity = 1) {
  await page.goto("/products/arc-desk-lamp");
  await page.getByRole("button", { name: "Select Sage", exact: true }).click();
  for (let n = 1; n < quantity; n++) await page.getByRole("button", { name: "Increase quantity of Arc desk lamp", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(bag(page)).toHaveAccessibleName(`Shopping bag, ${quantity} items`);
}
async function order(page: Page) {
  await bag(page).click();
  await page.getByRole("link", { name: "On to checkout", exact: true }).click();
  for (const [label, value] of [["Email address", "shopper@example.test"], ["Full name", "Alex Shopper"], ["Street address", "42 Demo Lane"], ["City", "Demo City"], ["ZIP / postal code", "12345"]]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("radio", { name: /Express delivery/ }).check();
  await page.getByRole("button", { name: "Place demo order", exact: true }).click();
  await expect(page).toHaveURL("/checkout/success");
  await expect(receipt(page)).toBeVisible();
}

test("reload keeps Sage lamp quantity two and the bag count", async ({ page }) => {
  await addLamp(page, 2);
  await page.reload();
  await expect(bag(page)).toHaveAccessibleName("Shopping bag, 2 items");
  await bag(page).click();
  const line = page.getByRole("article", { name: "Arc desk lamp (Sage)", exact: true });
  await expect(line.getByTestId("quantity")).toHaveText("2");
  await expect(line.getByTestId("line-total")).toHaveText("$136");
});

test("reload keeps the receipt ID, express shipping and full order history", async ({ page }) => {
  await addLamp(page, 2);
  await order(page);
  const id = await receipt(page).getAttribute("aria-label");
  await page.reload();
  await expect(receipt(page)).toHaveAttribute("aria-label", id!);
  await expect(receipt(page).getByTestId("receipt-shipping")).toHaveText("$12");
  await page.getByRole("link", { name: "View order history", exact: true }).click();
  await page.reload();
  await expect(receipt(page)).toHaveAttribute("aria-label", id!);
  await expect(receipt(page)).toContainText("Sage · Qty 2");
  await expect(receipt(page).getByTestId("receipt-shipping")).toHaveText("$12");
});

test("reset cancellation preserves all data; confirmation clears it and removes the key", async ({ page }) => {
  await addLamp(page);
  await page.getByRole("button", { name: "Save to wishlist", exact: true }).click();
  await order(page);
  await addLamp(page, 2);
  await bag(page).click();
  await page.getByLabel("Discount code", { exact: true }).fill("DESK15");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("link", { name: "My account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make yourself at home.", exact: true })).toBeVisible();
  await page.getByLabel("Email address", { exact: true }).fill("alex@deskdrop.demo");
  await page.getByLabel("Password", { exact: true }).fill("deskdrop123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Reset demo", exact: true }).click();
  const before = await page.evaluate(() => localStorage.getItem("deskdrop-demo-v1"));
  expect(JSON.parse(before!)).toMatchObject({ cart: [{ quantity: 2 }], wishlist: ["arc-desk-lamp"], user: { name: "Alex Morgan" }, coupon: { code: "DESK15" }, orders: [{}], lastOrder: {} });
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("button", { name: "Keep my data", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("deskdrop-demo-v1"))).toBe(before);
  await expect(bag(page)).toHaveAccessibleName("Shopping bag, 2 items");
  await expect(saved(page)).toHaveAccessibleName("Wishlist, 1 items");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("button", { name: "Yes, start fresh", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Fresh start. Your demo has been reset.");
  await expect(bag(page)).toHaveAccessibleName("Shopping bag, 0 items");
  await expect(saved(page)).toHaveAccessibleName("Wishlist, 0 items");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("deskdrop-demo-v1"))).toBeNull();
  await page.getByRole("contentinfo").getByRole("link", { name: "Your orders", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your story starts here.", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "My account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("deskdrop-demo-v1"))).toBeNull();
  await page.getByRole("link", { name: "DeskDrop home", exact: true }).click();
  await page.getByRole("button", { name: "Add Arc desk lamp to bag", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("deskdrop-demo-v1")!).cart.length)).toBe(1);
});

for (const failure of ["access", "write"]) {
  test(`storage ${failure} failure keeps checkout working without page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((mode) => {
      if (mode === "access") Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
      else Storage.prototype.setItem = () => { throw new Error("quota"); };
    }, failure);
    await addLamp(page);
    await order(page);
    await expect(receipt(page).getByTestId("receipt-shipping")).toHaveText("$12");
    expect(errors).toEqual([]);
  });
}

test("corrupt JSON loads an empty bag without page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("deskdrop-demo-v1", "{bad json"));
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Room for something good.", exact: true })).toBeVisible();
  await expect(bag(page)).toHaveAccessibleName("Shopping bag, 0 items");
  expect(errors).toEqual([]);
});

test("hostile storage drops invalid parts, keeps a valid line and cannot inject markup or identity", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("deskdrop-demo-v1", JSON.stringify({
    cart: [{ productId: "missing", color: "Sage", quantity: 1 }, { productId: "arc-desk-lamp", color: "Sage", quantity: 999 }, { productId: "arc-desk-lamp", color: "Sage", quantity: 2, unitPrice: 0 }],
    user: { name: "Mallory", email: "x@y.z" },
    orders: [{ id: "bad", address: { name: "<img src=x onerror=alert(1)>" } }],
    lastOrder: { id: "bad", address: { name: "<img src=x onerror=alert(1)>" } },
  })));
  await page.goto("/cart");
  await expect(page.getByRole("article", { name: "Arc desk lamp (Sage)", exact: true }).getByTestId("line-total")).toHaveText("$136");
  await expect(bag(page)).toHaveAccessibleName("Shopping bag, 2 items");
  await page.getByRole("contentinfo").getByRole("link", { name: "Your orders", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your story starts here.", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "My account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.locator("img[src='x'], [onerror]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("stored address markup is rendered only as text on the receipt", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("deskdrop-demo-v1", JSON.stringify({ lastOrder: {
    id: "DD-ABC12345", createdAt: "2026-10-29T12:00:00Z", items: [{ productId: "arc-desk-lamp", color: "Sage", quantity: 1, unitPrice: 68 }],
    subtotal: 68, discount: 0, shipping: 0, total: 68, delivery: "standard",
    address: { name: "<img src=x onerror=alert(1)>", email: "shopper@example.test", street: "42 Demo Lane", city: "Demo City", postal: "12345", country: "Canada" },
  } })));
  await page.goto("/checkout/success");
  await expect(receipt(page).getByText("<img src=x onerror=alert(1)>", { exact: true })).toBeVisible();
  await expect(page.locator("img[src='x'], [onerror]")).toHaveCount(0);
});

test("no empty-cart flash is painted while a stored cart hydrates after reload", async ({ page }) => {
  await addLamp(page, 2);
  await bag(page).click();
  await expect(page.getByRole("article", { name: "Arc desk lamp (Sage)", exact: true })).toBeVisible();
  await page.addInitScript(() => {
    const frames: string[] = [];
    Object.defineProperty(window, "cartPaints", { value: frames });
    const sample = () => {
      frames.push(document.querySelector("main")?.textContent ?? "");
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("article", { name: "Arc desk lamp (Sage)", exact: true })).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const frames = await page.evaluate(() => (window as unknown as { cartPaints: string[] }).cartPaints);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.some((text) => text.includes("Sage"))).toBe(true);
  expect(frames.every((text) => !text.includes("Room for something good."))).toBe(true);
});
