import { test, expect } from "@playwright/test";

function luminance(hex: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Expected #rrggbb color, received ${hex}`);
  const channels = hex.replace("#", "").match(/.{2}/g)!.map((part) => {
    const channel = parseInt(part, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

for (const colorScheme of ["dark", "light"] as const) {
  test(`${colorScheme} theme meets WCAG text, CTA and focus contrast`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(Array.from(style).filter((name) => name.startsWith("--color-") || name.startsWith("--art-")).sort().map((name) => [name, style.getPropertyValue(name).trim()]));
    });
    const pairs: [string, string, number][] = [
      ["text", "bg", 4.5], ["text", "surface", 4.5], ["muted", "bg", 4.5], ["muted", "surface", 4.5],
      ["on-primary", "primary", 4.5], ["link", "bg", 4.5], ["active-text", "bg", 4.5], ["primary", "bg", 3],
      ["link", "surface", 4.5], ["active-text", "surface", 4.5], ["success-text", "bg", 4.5], ["primary", "surface", 3],
    ];
    for (const [foreground, background, minimum] of pairs) {
      const a = luminance(tokens[`--color-${foreground}`]);
      const b = luminance(tokens[`--color-${background}`]);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      console.log(`${colorScheme}: ${foreground} on ${background} = ${ratio.toFixed(3)}:1`);
      expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(minimum);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}


test("regression: contrast parser rejects unsupported color forms", () => {
  for (const color of ["#fff", "rgb(255, 255, 255)", "ffffff", "#gggggg", "#ffffffff"]) {
    expect(() => luminance(color), color).toThrow(/#rrggbb/);
  }
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`regression: ${colorScheme} focus and control borders meet non-text contrast`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await page.keyboard.press("Tab");
    const save = page.getByRole("button", { name: "Save Arc desk lamp to wishlist", exact: true });
    await save.focus();
    await expect(save).toHaveCSS("outline-style", "solid");
    expect(await save.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThan(0);
    const outline = await save.evaluate((element) => getComputedStyle(element).outlineColor);
    const channels = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(outline);
    expect(channels, "opaque RGB focus outline").not.toBeNull();
    const focus = `#${channels!.slice(1).map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}`;
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(["--color-bg", "--color-surface", "--art-bg", "--color-control-border"].map((name) => [name, style.getPropertyValue(name).trim()]));
    });
    for (const background of ["--color-bg", "--color-surface", "--art-bg"]) {
      const a = luminance(focus);
      const b = luminance(tokens[background]);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      console.log(`${colorScheme}: focus outline on ${background} = ${ratio.toFixed(3)}:1`);
      expect.soft(ratio, `focus outline on ${background}`).toBeGreaterThanOrEqual(3);
    }
    const border = tokens["--color-control-border"];
    expect.soft(border, "control border token").toMatch(/^#[0-9a-fA-F]{6}$/);
    if (/^#[0-9a-fA-F]{6}$/.test(border)) {
      for (const background of ["--color-bg", "--color-surface"]) {
        const a = luminance(border);
        const b = luminance(tokens[background]);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        console.log(`${colorScheme}: control border on ${background} = ${ratio.toFixed(3)}:1`);
        expect.soft(ratio, `control border on ${background}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
}
