import { test, expect } from '@playwright/test';

test.describe('Landing experience', () => {
  test('navigate to teacher and student areas', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Teach visually. Collaborate instantly.' })
    ).toBeVisible();
    await expect(page.getByText('PICK YOUR WORKSPACE')).toBeVisible();

    await page.locator('.teacher-card').click();
    await expect(page).toHaveURL(/\/teacher/);
    await expect(page.locator('.connection-pill')).toHaveText(/Connected/i, {
      timeout: 20_000,
    });

    await page.goto('/');
    await page.locator('.student-card').click();
    await expect(page).toHaveURL(/\/student-login/);
    await expect(page.getByRole('heading', { name: 'Student Login' })).toBeVisible();
  });
});
