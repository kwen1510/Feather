import { test, expect } from '@playwright/test';

const buildUrl = (baseUrl: string, path: string) => {
  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${trimmed}${path.startsWith('/') ? path : `/${path}`}`;
};

const encodeResponse = (payload: unknown) => JSON.stringify(payload);

test.describe('History route', () => {
  test('displays session history, filters questions, and overlays responses', async ({ page }, testInfo) => {
    const baseUrl =
      testInfo.project.use.baseURL ?? process.env.FEATHER_BASE_URL ?? 'http://127.0.0.1:5173';

    const mockSessions = [
      {
        id: 'session-1',
        room_code: 'HIST01',
        status: 'ended',
        teacher_name: 'Ms. Aurora',
        created_at: '2024-02-01T10:00:00.000Z',
        started_at: '2024-02-01T10:05:00.000Z',
        ended_at: '2024-02-01T11:00:00.000Z',
      },
    ];

    const mockQuestions = [
      {
        id: 'question-1',
        session_id: 'session-1',
        question_number: 1,
        content_type: 'image',
        template_type: null,
        sent_at: '2024-02-01T10:10:00.000Z',
        image_data: {
          dataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
          width: 800,
          height: 600,
          filename: 'board.png',
        },
      },
      {
        id: 'question-2',
        session_id: 'session-1',
        question_number: 2,
        content_type: 'template',
        template_type: 'hanzi',
        sent_at: '2024-02-01T10:20:00.000Z',
        image_data: null,
      },
    ];

    const mockAnnotationsQuestion1 = [
      {
        id: 'annotation-1',
        question_id: 'question-1',
        session_id: 'session-1',
        student_lines: [
          {
            points: [50, 50, 200, 220, 400, 300],
            color: '#111111',
            strokeWidth: 4,
          },
        ],
        teacher_annotations: [
          {
            points: [100, 400, 500, 420],
            color: '#FF3B30',
            strokeWidth: 5,
          },
        ],
        created_at: '2024-02-01T10:12:00.000Z',
        last_updated_at: '2024-02-01T10:13:00.000Z',
        participant: {
          id: 'participant-1',
          name: 'Ada Lovelace',
          student_id: 'stu-101',
          client_id: 'client-1',
          role: 'student',
        },
      },
    ];

    await page.route('**/rest/v1/sessions**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: encodeResponse(mockSessions),
      })
    );

    await page.route('**/rest/v1/questions**', (route) => {
      const url = new URL(route.request().url());
      const sessionParam = url.searchParams.get('session_id');
      const sessionId = sessionParam?.replace('eq.', '') ?? null;
      const response = mockQuestions.filter((question) => question.session_id === sessionId);

      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: encodeResponse(response),
      });
    });

    await page.route('**/rest/v1/annotations**', (route) => {
      const url = new URL(route.request().url());
      const questionParam = url.searchParams.get('question_id');
      const questionId = questionParam?.replace('eq.', '') ?? null;
      const payload =
        questionId === 'question-1'
          ? mockAnnotationsQuestion1
          : [];

      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: encodeResponse(payload),
      });
    });

    await page.goto(buildUrl(baseUrl, '/history'));

    await expect(page.getByRole('heading', { level: 1, name: /Session History/i })).toBeVisible();
    await expect(page.locator('.history-question')).toHaveCount(2);

    await expect(page.getByRole('heading', { level: 2, name: /Question 1/i })).toBeVisible();
    await expect(page.locator('.history-response-card')).toHaveCount(1);
    await expect(page.locator('.history-response-card strong')).toHaveText(/Ada Lovelace/);
    await expect(page.locator('.history-stroke-counts')).toContainText('1 student');
    await expect(page.locator('.history-stroke-counts')).toContainText('1 teacher');

    const filterField = page.locator('#question-filter');
    await filterField.fill('template');
    await expect(page.locator('.history-question')).toHaveCount(1);
    await expect(page.locator('.history-question-type').first()).toContainText(/template/i);

    await filterField.fill('');
    await expect(page.locator('.history-question')).toHaveCount(2);

    await page.locator('.history-question', { hasText: 'Q2' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Question 2/i })).toBeVisible();
    await expect(page.locator('.history-empty-inline')).toContainText(/No saved responses/i);
  });
});
