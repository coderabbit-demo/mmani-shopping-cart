import { test, expect, type Page } from "@playwright/test";

const wishlist = (page: Page) => page.getByRole("link", { name: /^Wishlist, \d+ items$/ });
async function signIn(page: Page, password = "deskdrop123") {
  await expect(page.getByRole("heading", { name: "Make yourself at home.", exact: true })).toBeVisible();
  await page.getByLabel("Email address", { exact: true }).fill("alex@deskdrop.demo");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("rule 5: sign-in and sign-out preserve both saved products and wishlist order", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Arc desk lamp", "Form mechanical keyboard"]) await page.getByRole("button", { name: `Save ${name} to wishlist`, exact: true }).click();
  await expect(wishlist(page)).toHaveAccessibleName("Wishlist, 2 items");
  await wishlist(page).click();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(2);
  await page.getByRole("link", { name: "Sign in to your account.", exact: true }).click();
  await signIn(page);
  await expect(page).toHaveURL("/wishlist");
  await expect(wishlist(page)).toHaveAccessibleName("Wishlist, 2 items");
  await expect(page.getByRole("main").getByRole("article").nth(0)).toHaveAttribute("aria-label", "Arc desk lamp");
  await expect(page.getByRole("main").getByRole("article").nth(1)).toHaveAttribute("aria-label", "Form mechanical keyboard");
  await page.getByRole("link", { name: "My account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Good to see you, Alex.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("You’ve signed out. See you soon.");
  await expect(wishlist(page)).toHaveAccessibleName("Wishlist, 2 items");
  await wishlist(page).click();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(2);
});

test("wrong password shows the domain error and leaves the shopper signed out", async ({ page }) => {
  await page.goto("/account");
  await signIn(page, "wrong");
  await expect(page.getByRole("alert").filter({ hasText: "Those details don't match our demo account." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
});

for (const [next, destination] of [["wishlist", "/wishlist"], ["checkout", "/checkout"], ["https://example.test", null], ["//example.test", null], ["Wishlist", null]] as const) {
  test(`next=${next} uses only the exact redirect allow-list`, async ({ page }) => {
    const path = `/account?next=${encodeURIComponent(next)}`;
    await page.goto(path);
    await signIn(page);
    if (destination) await expect(page).toHaveURL(destination);
    else {
      await expect(page.getByRole("heading", { name: "Good to see you, Alex.", exact: true })).toBeVisible();
      await expect(page).toHaveURL(path);
    }
  });
}

test("checkout sign-in prompt returns to a prefilled form, including after reload", async ({ page }) => {
  await page.goto("/products/arc-desk-lamp");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("link", { name: /^Shopping bag, 1 items$/ }).click();
  await page.getByRole("link", { name: "On to checkout", exact: true }).click();
  await expect(page.getByText("Already part of the desk club?", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/account?next=checkout");
  await signIn(page);
  await expect(page).toHaveURL("/checkout");
  for (let n = 0; n < 2; n++) {
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("alex@deskdrop.demo");
    await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Alex Morgan");
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
    if (n === 0) await page.reload();
  }
});

test("password is never stored; reload restores only the demo identity", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByText("Demo account only. Use these sample credentials. This is not real authentication.", { exact: true })).toBeVisible();
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Good to see you, Alex.", exact: true })).toBeVisible();
  const raw = await page.evaluate(() => localStorage.getItem("deskdrop-demo-v1"));
  expect(raw).not.toBeNull();
  expect(raw).not.toContain("deskdrop123");
  expect(JSON.parse(raw!).user).toEqual({ name: "Alex Morgan", email: "alex@deskdrop.demo" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Good to see you, Alex.", exact: true })).toBeVisible();
});
