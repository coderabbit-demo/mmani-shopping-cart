import { chromium, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const imagePattern = /^us-central1-docker\.pkg\.dev\/se-demos-project\/deskdrop\/deskdrop@sha256:[a-f0-9]{64}$/;
export function validate({ url, source, image }) {
  if (url !== 'http://app:3000') throw new Error('Target must be the private Compose app endpoint');
  if (!/^[a-f0-9]{40}$/.test(source ?? '')) throw new Error('A full source commit is required');
  if (!imagePattern.test(image ?? '')) throw new Error('An owned immutable image digest is required');
  return { url, source, image };
}
export async function journey(config, browserType = chromium, assertion = expect) {
  const { url, source, image } = validate(config);
  const browser = await browserType.launch({ headless: true, chromiumSandbox: true });
  try {
    const context = await browser.newContext({ baseURL: url });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      await page.goto('/', { timeout: 20000, waitUntil: 'domcontentloaded' });
      for (const [name, color] of [['Arc desk lamp', 'Terracotta'], ['Tidy desk organizer', 'Natural oak']]) {
        await page.getByRole('link', { name: 'DeskDrop home', exact: true }).click();
        await page.getByRole('article', { name, exact: true }).getByRole('heading').getByRole('link').click();
        await page.getByRole('button', { name: `Select ${color}`, exact: true }).click();
        await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
      }
      await page.getByRole('link', { name: /^Shopping bag, \d+ items$/ }).click();
      await page.getByLabel('Discount code', { exact: true }).fill('DESK15');
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      await page.getByRole('link', { name: 'On to checkout', exact: true }).click();
      await page.getByRole('radio', { name: /Express delivery/ }).check();
      for (const [id, value] of [['subtotal', '$100'], ['discount', '−$15'], ['shipping', '$12'], ['total', '$97']]) await assertion(page.getByTestId(id)).toHaveText(value);
      for (const [label, value] of [['Email address', 'shopper@example.test'], ['Full name', 'Alex Shopper'], ['Street address', '42 Demo Lane'], ['City', 'Demo City'], ['ZIP / postal code', '12345']]) await page.getByLabel(label, { exact: true }).fill(value);
      await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
      await assertion(page).toHaveURL(`${url}/checkout/success`);
      const verifyReceipt = async () => {
        const receipt = page.getByRole('article', { name: /^Order DD-/ });
        for (const [id, value] of [['receipt-subtotal', '$100'], ['receipt-discount', '−$15'], ['receipt-shipping', '$12'], ['receipt-total', '$97']]) await assertion(receipt.getByTestId(id)).toHaveText(value);
        const lines = receipt.getByRole('listitem');
        await assertion(lines).toHaveCount(2);
        await assertion(lines.filter({ hasText: 'Arc desk lamp' })).toContainText('Terracotta · Qty 1');
        await assertion(lines.filter({ hasText: 'Tidy desk organizer' })).toContainText('Natural oak · Qty 1');
      };
      await verifyReceipt();
      await page.getByRole('link', { name: 'View order history', exact: true }).click();
      await verifyReceipt();
      return { status: 'pass', source, image, journey: 'cart-receipt-history' };
    } finally { await context.close(); }
  } finally { await browser.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  journey({ url: process.env.CHECKER_URL, source: process.env.SOURCE_COMMIT, image: process.env.APP_IMAGE }).then(
    result => console.log(JSON.stringify(result)),
    () => { console.error('Checker failed; inspect the private target without collecting customer data.'); process.exitCode = 1; },
  );
}
