import {defineConfig, devices} from '@playwright/test';

const PORT = 6100;

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    reporter: 'list',
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        trace: 'on-first-retry',
    },
    webServer: {
        command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
    projects: [
        {name: 'chromium', use: {...devices['Desktop Chrome']}},
    ],
});
