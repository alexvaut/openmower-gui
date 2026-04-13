import {expect, test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLE_PATH = resolve(__dirname, '../../../map_backup_2026-04-12.json');

async function goToEditor(page: import('@playwright/test').Page) {
    await page.goto('/#/map-editor');
    await expect(page.locator('.map-editor-root')).toBeVisible();
}

async function loadSample(page: import('@playwright/test').Page) {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('.map-editor-root').getByRole('button', {name: /upload Load/}).click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles(SAMPLE_PATH);
    await expect.poll(async () =>
        page.locator('path[data-area-id]').count(),
    {timeout: 10_000}).toBe(32);
}

test('loads sample, renders 32 areas + 1 dock, saves byte-equivalent', async ({page}) => {
    await goToEditor(page);
    await loadSample(page);

    await expect(page.locator('g[data-dock-id]')).toHaveCount(1);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('.map-editor-root').getByRole('button', {name: /download Save/}).click();
    const download = await downloadPromise;
    const p = await download.path();
    const downloaded = JSON.parse(readFileSync(p, 'utf8'));
    const original = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8'));
    expect(downloaded).toEqual(original);
});

test('changing area type flips the dirty marker', async ({page}) => {
    await goToEditor(page);
    await loadSample(page);

    const saveBtn = page.locator('.map-editor-root').getByRole('button', {name: /download Save/});
    await expect(saveBtn).not.toContainText('●');

    await page.locator('path[data-area-id]').first().click({force: true});
    await page.locator('label.ant-radio-button-wrapper', {hasText: /^Nav$/}).click();
    await expect(saveBtn).toContainText('●');
});

test('undo restores after a change', async ({page}) => {
    await goToEditor(page);
    await loadSample(page);

    await page.locator('path[data-area-id]').first().click({force: true});
    const initialType = await page.locator('label.ant-radio-button-wrapper-checked').textContent();

    await page.locator('label.ant-radio-button-wrapper', {hasText: /^Nav$/}).click();
    await expect(page.locator('label.ant-radio-button-wrapper-checked')).toHaveText('Nav');
    await page.keyboard.press('Control+z');

    await expect(page.locator('label.ant-radio-button-wrapper-checked')).toHaveText(initialType!);
});
