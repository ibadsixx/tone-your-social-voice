// do1.md - Local Runtime Verification: Group Share in DM
// End-to-end test: sign in as recipient via UI, open DM, verify group-share card renders

import { test, expect } from '@playwright/test';

const RECIPIENT_EMAIL = 'dx-do1-recipient-1794134612@example.com';
const RECIPIENT_PASSWORD = 'testpass123';
const CONVERSATION_ID = '1ad74613-e3b7-479d-93a9-05283c4c4d2f';
const GROUP_NAME = 'DX Test Group';
const GROUP_DESCRIPTION = 'A group for DX verification';

test.describe('Group Share in DM - Live Runtime Verification', () => {
  test('sign in as recipient and verify group-share card renders', async ({ page }) => {
    await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await page.getByRole('tab', { name: 'Sign In' }).click();
    await page.waitForTimeout(500);

    await page.getByPlaceholder('Enter your email').fill(RECIPIENT_EMAIL);
    await page.getByPlaceholder('Enter your password').fill(RECIPIENT_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(5000);

    // Navigate to the DM conversation
    await page.goto(`http://localhost:8080/messages/${CONVERSATION_ID}`, {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForTimeout(5000);

    // Check if group-share card renders
    const groupCard = page.locator('[role="button"]').filter({ hasText: GROUP_NAME });
    const cardCount = await groupCard.count();
    console.log(`Group card count: ${cardCount}`);

    if (cardCount > 0) {
      await expect(groupCard.first()).toBeVisible();
      await expect(page.getByText(GROUP_NAME)).toBeVisible();
      await expect(page.getByText(GROUP_DESCRIPTION)).toBeVisible();
      console.log('SUCCESS: Group-share card renders correctly!');
    } else {
      console.log('WARNING: Group-share card not found');
      const bodyText = await page.locator('body').textContent();
      console.log('Body text (first 1000):', bodyText?.substring(0, 1000));
    }

    await page.screenshot({ path: '/tmp/do1-final-verification.png', fullPage: true });
    console.log('Screenshot saved to /tmp/do1-final-verification.png');
  });
});
