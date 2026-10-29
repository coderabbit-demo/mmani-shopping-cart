import { test, expect, type Page, type Locator } from "@playwright/test";

const address = { email: "shopper@example.test", name: "Alex Shopper", street: "42 Demo Lane", city: "Demo City", postal: "12345" };
const labels = { email: "Email address", name: "Full name", street: "Street address", city: "City", postal: "ZIP / postal code" };
const bag = (page: Page) => page.getByRole("link", { name: /^Shopping bag, \d+ items$/ });
const receipt = (page: Page) => page.getByRole("article", { name: /^Order DD-/ });

async function addProduct(page: Page, name = "Arc desk lamp", color = "Terracotta", quantity = 1) {
  await page.getByRole("link", { name: "DeskDrop home", exact: true }).click();
  await page.getByRole("article", { name, exact: true }).getByRole("heading").getByRole("link").click();
  await page.getByRole("button", { name: `Select ${color}`, exact: true }).click();
  for (let n = 1; n < quantity; n++) await page.getByRole("button", { name: `Increase quantity of ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
}
async function checkout(page: Page) {
  await bag(page).click();
  await expect(page.getByRole("link", { name: "On to checkout", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "On to checkout", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make it yours.", exact: true })).toBeVisible();
}
async function fillAddress(page: Page, values = address) {
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) await page.getByLabel(labels[key], { exact: true }).fill(values[key]);
}
async function submit(page: Page) {
  await page.getByRole("button", { name: "Place demo order", exact: true }).click();
  await expect(page).toHaveURL("/checkout/success");
  await expect(page.getByRole("heading", { name: "Your desk says thanks.", exact: true })).toBeVisible();
}
async function history(page: Page) {
  await page.getByRole("link", { name: "View order history", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your orders.", exact: true })).toBeVisible();
}
async function amounts(target: Locator, shipping: string, total: string, discount?: string) {
  await expect(target.getByTestId("receipt-shipping")).toHaveText(shipping);
  await expect(target.getByTestId("receipt-total")).toHaveText(total);
  if (discount) await expect(target.getByTestId("receipt-discount")).toHaveText(discount);
  else await expect(target.getByTestId("receipt-discount")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("rule 4: standard and express update checkout, receipt and history", async ({ page }) => {
  await addProduct(page);
  await checkout(page);
  await expect(page.getByTestId("shipping")).toHaveText("Free");
  await expect(page.getByTestId("total")).toHaveText("$68");
  await expect(page.getByRole("region", { name: "Order summary" })).toContainText("Terracotta · Qty 1");
  await page.getByRole("radio", { name: /Express delivery/ }).check();
  await expect(page.getByTestId("shipping")).toHaveText("$12");
  await expect(page.getByTestId("total")).toHaveText("$80");
  await fillAddress(page);
  await submit(page);
  await amounts(receipt(page), "$12", "$80");
  await expect(receipt(page)).toContainText("Express · 1–2 business days");
  await expect(receipt(page)).toContainText("Confirmed");
  await expect(receipt(page).getByTestId("receipt-subtotal")).toHaveText("$68");
  await history(page);
  await amounts(receipt(page), "$12", "$80");
  await expect(receipt(page)).toContainText("Processing");
});

test("rule 4: DESK15 and express remain in all totals", async ({ page }) => {
  await addProduct(page);
  await addProduct(page, "Tidy desk organizer", "Natural oak");
  await bag(page).click();
  await page.getByLabel("Discount code", { exact: true }).fill("DESK15");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("link", { name: "On to checkout", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "On to checkout", exact: true }).click();
  await page.getByRole("radio", { name: /Express delivery/ }).check();
  await expect(page.getByTestId("subtotal")).toHaveText("$100");
  await expect(page.getByTestId("discount")).toHaveText("−$15");
  await expect(page.getByTestId("shipping")).toHaveText("$12");
  await expect(page.getByTestId("total")).toHaveText("$97");
  await fillAddress(page);
  await submit(page);
  await amounts(receipt(page), "$12", "$97", "−$15");
  await history(page);
  await amounts(receipt(page), "$12", "$97", "−$15");
});

test("rule 6: every color and quantity survives two complete orders, newest first", async ({ page }) => {
  await addProduct(page, "Arc desk lamp", "Sage", 2);
  await addProduct(page);
  await addProduct(page, "Form mechanical keyboard", "Cloud");
  await checkout(page);
  await fillAddress(page);
  await submit(page);
  const firstId = await receipt(page).getAttribute("aria-label");
  async function allLines(target: Locator) {
    await expect(target.getByRole("listitem")).toHaveCount(3);
    await expect(target.getByRole("listitem").filter({ hasText: "Sage · Qty 2" })).toContainText("$136");
    await expect(target.getByRole("listitem").filter({ hasText: "Terracotta · Qty 1" })).toContainText("$68");
    await expect(target.getByRole("listitem").filter({ hasText: "Cloud · Qty 1" })).toContainText("Form mechanical keyboard");
  }
  await allLines(receipt(page));
  await history(page);
  await allLines(receipt(page));
  await addProduct(page, "Tidy desk organizer", "Natural oak", 2);
  await checkout(page);
  await fillAddress(page);
  await submit(page);
  const secondId = await receipt(page).getAttribute("aria-label");
  expect(secondId).not.toBe(firstId);
  await history(page);
  await expect(receipt(page)).toHaveCount(2);
  await expect(receipt(page).nth(0)).toHaveAttribute("aria-label", secondId!);
  await expect(receipt(page).nth(0).getByRole("listitem")).toHaveCount(1);
  await expect(receipt(page).nth(0)).toContainText("Natural oak · Qty 2");
  await expect(receipt(page).nth(0)).toContainText("$64");
  await expect(receipt(page).nth(1)).toHaveAttribute("aria-label", firstId!);
  await allLines(receipt(page).nth(1));
});

test("validation: five missing fields are associated, focused and block ordering", async ({ page }) => {
  await addProduct(page);
  await checkout(page);
  await expect(page.getByLabel("Country", { exact: true })).toHaveValue("United States");
  await expect(page.locator("form").filter({ has: page.getByLabel("Email address", { exact: true }) })).toHaveAttribute("novalidate", "");
  await page.getByRole("button", { name: "Place demo order", exact: true }).click();
  const messages = { email: "Enter your email address.", name: "Enter your full name.", street: "Enter your street address.", city: "Enter your city.", postal: "Enter your ZIP or postal code." };
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
    const field = page.getByLabel(labels[key], { exact: true });
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAccessibleDescription(messages[key]);
    await expect(page.getByText(messages[key], { exact: true })).toBeVisible();
  }
  await expect(page.getByLabel("Email address", { exact: true })).toBeFocused();
  await expect(page).toHaveURL("/checkout");
  await expect(bag(page)).toHaveAccessibleName("Shopping bag, 1 items");
  await page.getByRole("link", { name: "Your orders", exact: true }).click();
  await expect(page.getByText("Your story starts here.", { exact: true })).toBeVisible();
});

test("validation: whitespace-only values and invalid email use distinct messages", async ({ page }) => {
  await addProduct(page);
  await checkout(page);
  await fillAddress(page, { ...address, email: "bad-email", name: "   " });
  await page.getByRole("button", { name: "Place demo order", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveAccessibleDescription("Enter a valid email address.");
  await expect(page.getByLabel("Full name", { exact: true })).toHaveAccessibleDescription("Enter your full name.");
  await expect(page.getByLabel("Email address", { exact: true })).toBeFocused();
  await expect(page).toHaveURL("/checkout");
  await fillAddress(page);
  await submit(page);
  await amounts(receipt(page), "Free", "$68");
});

test("regression: errored fields revalidate on every change without clearing other errors", async ({ page }) => {
  await addProduct(page);
  await checkout(page);
  await page.getByRole("button", { name: "Place demo order", exact: true }).click();
  const email = page.getByLabel("Email address", { exact: true });
  await expect(email).toHaveAccessibleDescription("Enter your email address.");
  await email.fill("alex");
  await expect(email).toHaveAccessibleDescription("Enter a valid email address.");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await email.fill("alex@example.com");
  await expect(email).toHaveAccessibleDescription("");
  await expect(email).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a valid email address.", { exact: true })).toHaveCount(0);
  await email.fill("");
  await expect(email).toHaveAccessibleDescription("Enter your email address.");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await email.fill("alex@example.com");
  await expect(email).not.toHaveAttribute("aria-invalid", "true");
  const messages = { name: "Enter your full name.", street: "Enter your street address.", city: "Enter your city.", postal: "Enter your ZIP or postal code." };
  for (const key of Object.keys(messages) as (keyof typeof messages)[]) {
    await expect(page.getByLabel(labels[key], { exact: true })).toHaveAccessibleDescription(messages[key]);
    await expect(page.getByLabel(labels[key], { exact: true })).toHaveAttribute("aria-invalid", "true");
  }
  for (const key of Object.keys(messages) as (keyof typeof messages)[]) {
    const field = page.getByLabel(labels[key], { exact: true });
    await field.fill("   ");
    await expect(field).toHaveAccessibleDescription(messages[key]);
    await field.fill(`  ${address[key]}  `);
    await expect(field).not.toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAccessibleDescription("");
    await expect(page.getByText(messages[key], { exact: true })).toHaveCount(0);
  }
  await page.getByLabel("Full name", { exact: true }).fill("   ");
  await expect(page.getByLabel("Full name", { exact: true })).toHaveAccessibleDescription(messages.name);
  await expect(page.getByLabel("Full name", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL("/checkout");
});

test("regression: pristine fields stay quiet while typing before submission", async ({ page }) => {
  await addProduct(page);
  await checkout(page);
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
    const field = page.getByLabel(labels[key], { exact: true });
    await field.fill(key === "email" ? "alex" : "   ");
    await expect(field).not.toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAccessibleDescription("");
    await field.fill("");
    await expect(field).not.toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAccessibleDescription("");
  }
});

test("regression: field attributes guard length limits and autofill tokens", async ({ page }) => {
  await addProduct(page);
  await checkout(page);
  for (const [label, maxLength, autoComplete] of [
    ["Email address", "254", "email"],
    ["Full name", "100", "name"],
    ["Street address", "200", "street-address"],
    ["City", "100", "address-level2"],
    ["ZIP / postal code", "20", "postal-code"],
  ]) {
    const field = page.getByLabel(label, { exact: true });
    await expect(field).toHaveAttribute("maxlength", maxLength);
    await expect(field).toHaveAttribute("autocomplete", autoComplete);
  }
  await expect(page.getByLabel("Country", { exact: true })).toHaveAttribute("autocomplete", "country-name");
});

test("trimmed address, ID, UTC date, no URL data, logs or storage, and duplicate-submit guard", async ({ page }) => {
  await addProduct(page);
  const logs: string[] = [];
  page.on("console", (message) => logs.push(message.text()));
  await checkout(page);
  await fillAddress(page, Object.fromEntries(Object.entries(address).map(([key, value]) => [key, `  ${value}  `])) as typeof address);
  await page.getByLabel("Country", { exact: true }).selectOption("Canada");
  const before = Date.now();
  await page.getByRole("button", { name: "Place demo order", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page).toHaveURL("/checkout/success");
  await expect(receipt(page)).toHaveAttribute("aria-label", /^Order DD-[0-9A-F]{8}$/);
  const date = new Date(before).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  await expect(receipt(page).locator("time")).toHaveText(date);
  for (const value of Object.values(address)) await expect(receipt(page).getByText(value, { exact: true })).toBeVisible();
  await expect(receipt(page)).toContainText("Canada");
  await expect(page.getByText("Order confirmed, Alex. Your new favorites are one step closer.", { exact: true })).toBeVisible();
  expect(page.url()).not.toContain("?");
  for (const value of Object.values(address)) expect(decodeURIComponent(page.url())).not.toContain(value);
  await history(page);
  await expect(receipt(page)).toHaveCount(1);
  expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))).toEqual({ local: {}, session: {} });
  expect(logs).toEqual([]);
});

test("regression: checkout succeeds without randomUUID and emits no pageerror", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => { delete Object.getPrototypeOf(crypto).randomUUID; });
  await page.reload();
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  await addProduct(page);
  await checkout(page);
  await fillAddress(page);
  await submit(page);
  await expect(receipt(page).getByRole("heading", { level: 2 })).toHaveText(/^ORDER DD-[0-9A-F]{8}$/);
  expect(errors).toEqual([]);
});

for (const stage of ["random bytes", "timestamp"] as const) {
  test(`regression: checkout can retry after ${stage} preparation throws`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await addProduct(page);
    await checkout(page);
    await fillAddress(page);
    await page.evaluate((failureStage) => {
      if (failureStage === "random bytes") {
        const original = crypto.getRandomValues.bind(crypto);
        Object.defineProperty(crypto, "getRandomValues", { configurable: true, value: () => {
          Object.defineProperty(crypto, "getRandomValues", { configurable: true, value: original });
          throw new Error("Synthetic random generation failure");
        } });
      } else {
        const original = Date.prototype.toISOString;
        Date.prototype.toISOString = function () {
          Date.prototype.toISOString = original;
          throw new Error("Synthetic timestamp failure");
        };
      }
    }, stage);
    const button = page.getByRole("button", { name: "Place demo order", exact: true });
    await button.click();
    await expect(page).toHaveURL("/checkout");
    await expect(button).toBeEnabled();
    await expect(bag(page)).toHaveAccessibleName("Shopping bag, 1 items");
    await submit(page);
    await expect(receipt(page).getByRole("heading", { level: 2 })).toHaveText(/^ORDER DD-[0-9A-F]{8}$/);
    await history(page);
    await expect(receipt(page)).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test("after ordering the bag is empty and the checkout empty state returns", async ({ page }) => {
  await addProduct(page);
  await checkout(page);
  await fillAddress(page);
  await submit(page);
  await expect(bag(page)).toHaveAccessibleName("Shopping bag, 0 items");
  await page.goBack();
  await expect(page).toHaveURL("/checkout");
  await expect(page.getByText("Your bag needs a little something.", { exact: true })).toBeVisible();
  await expect(page.getByText("Add an object to your bag before checking out.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Place demo order", exact: true })).toHaveCount(0);
});

test("benign markers remain literal text in receipt and history", async ({ page }) => {
  await addProduct(page);
  await checkout(page);
  await fillAddress(page, { ...address, name: "<b>marker</b>", street: "<i>x</i>" });
  await submit(page);
  for (let view = 0; view < 2; view++) {
    await expect(receipt(page).getByText("<b>marker</b>", { exact: true })).toBeVisible();
    await expect(receipt(page).getByText("<i>x</i>", { exact: true })).toBeVisible();
    await expect(receipt(page).locator("b, i")).toHaveCount(0);
    if (view === 0) await history(page);
  }
});

test("direct success visit without an order has the empty state", async ({ page }) => {
  await page.goto("/checkout/success");
  await expect(page.getByText("Nothing on its way just yet.", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link")).toHaveAttribute("href", "/");
});

test("375 by 812: populated checkout and orders do not scroll horizontally", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await addProduct(page);
  await checkout(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await fillAddress(page);
  await submit(page);
  await history(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

function expandHex(hex: string) {
  return /^#[\da-f]{3}$/i.test(hex) ? `#${hex.slice(1).split("").map((value) => value + value).join("")}` : hex;
}
function luminance(color: string) {
  const hex = expandHex(color);
  expect(hex).toMatch(/^#[\da-f]{6}$/i);
  const channels = hex.slice(1).match(/../g)!.map((value) => {
    const n = parseInt(value, 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
for (const colorScheme of ["dark", "light"] as const) {
  test(`${colorScheme}: error token meets 4.5 to 1 on page and form surfaces`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await addProduct(page);
    await checkout(page);
    await page.getByRole("button", { name: "Place demo order", exact: true }).click();
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(["danger", "bg", "surface"].map((key) => [key, style.getPropertyValue(`--color-${key}`).trim()]));
    });
    for (const background of ["bg", "surface"]) {
      const a = luminance(tokens.danger), b = luminance(tokens[background]);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      test.info().annotations.push({ type: "contrast", description: `${colorScheme}: danger on ${background} = ${ratio.toFixed(3)}:1` });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
    const color = await page.getByText("Enter your email address.", { exact: true }).evaluate((element) => getComputedStyle(element).color);
    const expected = expandHex(tokens.danger).slice(1).match(/../g)!.map((part) => parseInt(part, 16));
    expect(color).toBe(`rgb(${expected.join(", ")})`);
  });
}
