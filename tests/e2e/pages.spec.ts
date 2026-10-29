import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });

for (const [path, name] of [["/", "home.aria.yml"], ["/does-not-exist", "not-found.aria.yml"], ["/products/arc-desk-lamp", "product-arc-desk-lamp.aria.yml"], ["/cart", "cart-empty.aria.yml"], ["/checkout", "checkout-empty.aria.yml"], ["/orders", "orders-empty.aria.yml"], ["/account", "account-signed-out.aria.yml"], ["/wishlist", "wishlist-empty.aria.yml"], ["/demo", "demo.aria.yml"]]) {
  test(`${name} page golden`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText("Getting things ready…", { exact: true })).toHaveCount(0);
    await expect(page.locator("body")).toMatchAriaSnapshot({ name });
  });
}
