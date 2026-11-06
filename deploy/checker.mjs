export function validateLocal({ url, source, image }) {
  if (url !== 'http://deskdrop.test:3000') throw new Error('Target must be the private Compose app endpoint');
  if (!/^[a-f0-9]{40}$/.test(source ?? '')) throw new Error('A full source commit is required');
  if (!/^sha256:[a-f0-9]{64}$/.test(image ?? '')) throw new Error('A local image ID is required');
  return { url, source, image };
}
export async function journeyLocal(config, browserType, assertion, observe) {
  return runJourney(validateLocal(config), browserType, assertion, observe);
}
async function runJourney({ url, source, image }, browserType, assertion, observe) {
  if (browserType === undefined || assertion === undefined) {
    const playwright = await import('@playwright/test');
    if (browserType === undefined) browserType = playwright.chromium;
    if (assertion === undefined) assertion = playwright.expect;
  }
  const note = (stage, expected, actual = 'failed') => { if (observe) observe({ stage, expected, actual }); };
  const amount = async (stage, value, locator, check) => {
    try { await check(); } catch (error) {
      if (observe) {
        let actual = 'unavailable';
        try { const text = await locator.textContent({ timeout: 200 }); if (/^(?:−|-)?\$[0-9]{1,3}$/.test(text ?? '')) actual = text.replace('−', '-'); } catch {}
        note(stage, value.replace('−', '-'), actual);
      }
      throw error;
    }
  };
  note('journey', 'checkout_receipt_history');
  const browser = await browserType.launch({ headless: true, chromiumSandbox: true });
  try {
    const context = await browser.newContext({ baseURL: url });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      note('navigation', 'storefront_load');
      await page.goto('/', { timeout: 20000, waitUntil: 'domcontentloaded' });
      for (const [name, color] of [['Arc desk lamp', 'Terracotta'], ['Tidy desk organizer', 'Natural oak']]) {
        note(name === 'Arc desk lamp' ? 'add_lamp' : 'add_organizer', 'item_added');
        await page.getByRole('link', { name: 'DeskDrop home', exact: true }).click();
        await page.getByRole('article', { name, exact: true }).getByRole('heading').getByRole('link').click();
        await page.getByRole('button', { name: `Select ${color}`, exact: true }).click();
        await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
      }
      note('bag', 'bag_open');
      await page.getByRole('link', { name: /^Shopping bag, \d+ items$/ }).click();
      note('coupon', 'coupon_applied');
      await page.getByLabel('Discount code', { exact: true }).fill('DESK15');
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      note('checkout_open', 'checkout_open');
      await page.getByRole('link', { name: 'On to checkout', exact: true }).click();
      note('shipping', 'express_selected');
      await page.getByRole('radio', { name: /Express delivery/ }).check();
      for (const [id, value] of [['subtotal', '$100'], ['discount', '−$15'], ['shipping', '$12'], ['total', '$97']]) {
        const locator = page.getByTestId(id);
        await amount(`checkout_${id}`, value, locator, () => assertion(locator).toHaveText(value));
      }
      note('details', 'synthetic_details_entered');
      for (const [label, value] of [['Email address', 'shopper@example.test'], ['Full name', 'Alex Shopper'], ['Street address', '42 Demo Lane'], ['City', 'Demo City'], ['ZIP / postal code', '12345']]) await page.getByLabel(label, { exact: true }).fill(value);
      note('submit', 'order_submitted');
      await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
      note('receipt_url', 'checkout_success');
      await assertion(page).toHaveURL(`${url}/checkout/success`);
      const verifyReceipt = async phase => {
        const receipt = page.getByRole('article', { name: /^Order DD-/ });
        for (const [id, value] of [['receipt-subtotal', '$100'], ['receipt-discount', '−$15'], ['receipt-shipping', '$12'], ['receipt-total', '$97']]) {
          const locator = receipt.getByTestId(id);
          await amount(`${phase}_${id.slice(8)}`, value, locator, () => assertion(locator).toHaveText(value));
        }
        const lines = receipt.getByRole('listitem');
        try { await assertion(lines).toHaveCount(2); } catch (error) {
          let actual = 'unavailable';
          if (observe) { try { const count = await lines.count(); if (Number.isInteger(count) && count >= 0 && count <= 20) actual = String(count); } catch {} }
          note(`${phase}_count`, '2', actual); throw error;
        }
        try { await assertion(lines.filter({ hasText: 'Arc desk lamp' })).toContainText('Terracotta · Qty 1'); } catch (error) { note(`${phase}_lamp`, 'lamp_terracotta', 'mismatch'); throw error; }
        try { await assertion(lines.filter({ hasText: 'Tidy desk organizer' })).toContainText('Natural oak · Qty 1'); } catch (error) { note(`${phase}_organizer`, 'organizer_natural_oak', 'mismatch'); throw error; }
      };
      note('receipt', 'receipt_verified');
      await verifyReceipt('receipt');
      note('history_open', 'history_open');
      await page.getByRole('link', { name: 'View order history', exact: true }).click();
      note('history', 'history_verified');
      await verifyReceipt('history');
      return { status: 'pass', source, image, journey: 'cart-receipt-history' };
    } finally { await context.close(); }
  } finally { await browser.close(); }
}
