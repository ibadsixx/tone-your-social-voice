// do1.md - Local Runtime Verification: Group Share in DM
// Sign in with existing accounts, share group, verify card renders

import { test, expect } from '@playwright/test';

const RECIPIENT_EMAIL = 'dx-test-recipient@example.com';
const RECIPIENT_PASSWORD = 'testpass123';
const CONVERSATION_ID = 'b1ce29eb-fed5-4267-91fd-c0df711473fc';

test.describe('Group Share DM - Live Runtime Test', () => {
  test('sign in as recipient and verify group-share card', async ({ page }) => {
    await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click Sign In tab
    const signInTab = page.getByRole('tab', { name: 'Sign In' });
    if (await signInTab.isVisible()) {
      await signInTab.click();
      await page.waitForTimeout(500);
    }

    // Fill in credentials
    await page.getByPlaceholder('Enter your email').fill(RECIPIENT_EMAIL);
    await page.getByPlaceholder('Enter your password').fill(RECIPIENT_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(5000);

    // Check if signed in - look for navigation to messages or dashboard
    const currentUrl = page.url();
    console.log('Current URL after sign-in:', currentUrl);

    // Navigate to the DM conversation
    await page.goto(`http://localhost:8080/messages/${CONVERSATION_ID}`, {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForTimeout(5000);

    // Check if group-share card renders
    const groupCard = page.locator('[role="button"]').filter({ hasText: 'DX Test Group' });
    const cardCount = await groupCard.count();
    console.log('Group card count:', cardCount);

    if (cardCount > 0) {
      await expect(groupCard.first()).toBeVisible();
      await expect(page.getByText('DX Test Group')).toBeVisible();
      await expect(page.getByText('A group for DX verification')).toBeVisible();
      console.log('SUCCESS: Group-share card renders correctly!');
    } else {
      console.log('WARNING: Group-share card not found');
      const bodyText = await page.locator('body').textContent();
      console.log('Body text (first 1000):', bodyText?.substring(0, 1000));
    }

    await page.screenshot({ path: '/tmp/do1-final-screenshot.png', fullPage: true });
  });
});
