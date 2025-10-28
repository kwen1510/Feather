import { test, expect } from '@playwright/test';

/**
 * Utility to build absolute URLs from the configured baseURL.
 */
const buildUrl = (baseUrl: string, path: string) => {
  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${trimmed}${path.startsWith('/') ? path : `/${path}`}`;
};

test.describe('Student drawing happy path (test harness)', () => {
  test('students join, draw, and recover after refresh', async ({ browser }, testInfo) => {
    const baseUrl =
      testInfo.project.use.baseURL ??
      process.env.FEATHER_BASE_URL ??
      'http://127.0.0.1:5173';

    const roomCode = `E2E${Date.now().toString(36).toUpperCase()}`;
    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();

    await teacherPage.goto(
      buildUrl(baseUrl, `/test/teacher?room=${roomCode}`)
    );

    await expect(
      teacherPage.locator('.status-pill.connection-pill')
    ).toHaveText(/Connected/i, { timeout: 20_000 });

    const createStudent = async (index: number) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const name = `Playwright Student ${index}`;
      await page.goto(
        buildUrl(
          baseUrl,
          `/test/student?room=${roomCode}&name=${encodeURIComponent(name)}`
        )
      );
      await expect(page.locator('.connection-status')).toHaveText(/Connected/i, {
        timeout: 20_000,
      });
      return { context, page, name };
    };

    const students = [
      await createStudent(1),
      await createStudent(2),
    ];

    await expect(teacherPage.locator('.count-pill strong')).toHaveText('2', {
      timeout: 10_000,
    });

    // Draw a diagonal line with the first student.
    const canvas = students[0].page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible' });
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error('Failed to locate student canvas');
    }

    await students[0].page.mouse.move(box.x + 20, box.y + 20);
    await students[0].page.mouse.down();
    await students[0].page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 12,
    });
    await students[0].page.mouse.up();

    // Wait for teacher dashboard to render this student card.
    await expect(teacherPage.locator('.student-card')).toHaveCount(2, {
      timeout: 10_000,
    });

    // Refresh the first student and make sure the connection comes back.
    await students[0].page.reload();
    await expect(students[0].page.locator('.connection-status')).toHaveText(
      /Connected/i,
      { timeout: 20_000 }
    );

    await expect(teacherPage.locator('.count-pill strong')).toHaveText('2', {
      timeout: 10_000,
    });

    // Cleanup contexts to avoid leaking WebSocket connections.
    for (const student of students) {
      await student.context.close();
    }
    await teacherContext.close();
  });
});
