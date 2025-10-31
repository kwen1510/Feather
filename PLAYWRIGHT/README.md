# Remote Playwright Tests

This suite targets the production build running at `http://146.190.100.142/`.  
You can override the host with `FEATHER_BASE_URL` if you need to point at a different environment.

## Prerequisites

- Install dependencies and Playwright browsers once:
  ```bash
  npm install
  npx playwright install
  ```

## Running the tests

- Default (hits DigitalOcean instance):
  ```bash
  npm run test:e2e:remote
  ```

- Override the base URL (useful for staging or PR builds):
  ```bash
  FEATHER_BASE_URL=https://your-env.example.com npm run test:e2e:remote
  ```

## Included checks

- `landing.spec.ts` – Validates the marketing landing page, navigates to the teacher dashboard, waits for the Ably connection, and confirms the student login view.
- `test-harness.spec.ts` – Exercises the `/test/teacher` and `/test/student` harness routes: two students join, draw, reconnect after a refresh, and the teacher dashboard keeps both connections.

Artifacts (traces, videos, HTML reports) are written to `PLAYWRIGHT/playwright-report/`.  
Open the most recent report with:

```bash
npx playwright show-report PLAYWRIGHT/playwright-report
```
