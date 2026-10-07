import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PUBLIC_ARTIFACT_FILES } = require('./pages-allowlist.js');
const { chromium } = await import(process.env.QJZH_PLAYWRIGHT_MODULE || 'playwright');
const axeScript = process.env.QJZH_AXE_SCRIPT || require.resolve('axe-core/axe.min.js');
const argument = (key, fallback) => { const i = process.argv.indexOf(key); return i >= 0 ? process.argv[i + 1] : fallback; };
const root = path.resolve(argument('--root', 'dist'));
const out = path.resolve(argument('--out', 'output/browser-audit'));
fs.mkdirSync(out, { recursive: true });
assert.ok(fs.existsSync(path.join(root, 'index.html')), 'Build Pages before browser checks');
const files = new Set(PUBLIC_ARTIFACT_FILES);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.csv': 'text/csv', '.md': 'text/plain' };
const server = createServer((request, response) => {
  let relative;
  try { const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); relative = pathname.startsWith('/QJZH/') ? pathname.slice(6) || 'index.html' : ''; }
  catch { response.writeHead(400).end(); return; }
  if (!files.has(relative)) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', (mime[path.extname(relative)] || 'text/plain') + '; charset=utf-8');
  fs.createReadStream(path.join(root, relative)).on('error', () => response.destroy()).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/QJZH/`;
let browser;
const evidence = { matrix: [], accessibility: [], pageErrors: [], flows: [], performance: {} };
const header = 'timestamp,site_id,altitude_m,temp_c,rh_percent,raw_nh3_ppm,device_model';
const sample = `${header}\n2026-01-15T08:00:00+08:00,USER-01,2620,-5,62,0,sensor\n2026-02-30T08:00:00+08:00,BAD-01,2620,-5,62,0,sensor`;
async function route(page, view) {
  await page.evaluate(view => QJZH.viewRouter.go(view), view);
  await page.waitForFunction(view => document.body.dataset.view === view, view);
}
try {
  browser = await chromium.launch({ headless: true, ...(process.env.QJZH_BROWSER_EXECUTABLE ? { executablePath: process.env.QJZH_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => evidence.pageErrors.push(error.message));
  await page.goto(base + '#/data', { waitUntil: 'networkidle' });
  // Preview is read-only, partial errors remain visible, and cancel preserves data.
  await page.locator('#csvInput').setInputFiles({ name: 'observations.csv', mimeType: 'text/csv', buffer: Buffer.from(sample) });
  await page.locator('#csvImportPreview').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => QJZH.dataImport.getRecords().length), 0);
  await page.locator('#cancelCsvImport').click();
  assert.equal(await page.evaluate(() => QJZH.dataImport.getRecords().length), 0);
  await page.locator('#csvInput').setInputFiles({ name: 'observations.csv', mimeType: 'text/csv', buffer: Buffer.from(sample) });
  await page.locator('#csvImportPreview').waitFor({ state: 'visible' });
  assert.ok((await page.locator('#dataImportDetails').innerText()).includes('timestamp'));
  await page.locator('#languageSelect').selectOption('en');
  assert.match(await page.locator('#dataImportStatus').innerText(), /confirm/);
  await page.locator('#confirmCsvImport').click();
  assert.equal(await page.evaluate(() => QJZH.dataImport.getRecords().length), 1);
  assert.match(await page.locator('#dataRecordRows').innerText(), /0 ppm/);
  assert.match(await page.locator('#dataStorageSummary').innerText(), /1 \/ 5000/);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#downloadLocalData').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  assert.equal(fs.readFileSync(downloadPath, 'utf8').split(/\r?\n/).filter(Boolean).length, 2);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => QJZH.dataImport.getRecords().length), 1);
  evidence.flows.push('preview, cancel, partial import, language state, zero, CSV download, reload persistence');
  await route(page, 'institution');
  assert.equal(await page.locator('#institutionRows tr').count(), 1);
  assert.match(await page.locator('#institutionRows').innerText(), /USER-01/);
  await route(page, 'report');
  assert.equal(await page.locator('#reportStartDate').inputValue(), '2026-01-15');
  await page.evaluate(() => { window.open = () => null; });
  await page.locator('#generateReport').click();
  await page.locator('#reportPreview').waitFor({ state: 'visible' });
  assert.match(await page.locator('#reportPreviewFrame').getAttribute('srcdoc'), /2026-01-15/);
  await page.locator('#languageSelect').selectOption('en');
  assert.match(await page.locator('#reportPreviewFrame').getAttribute('srcdoc'), /lang='en'/);
  await page.locator('#reportStartDate').fill('2026-02-01');
  await page.locator('#generateReport').click();
  assert.equal(await page.locator('#reportPreview').isVisible(), false);
  assert.equal(await page.locator('#reportStatus').getAttribute('aria-busy'), 'false');
  evidence.flows.push('institution provenance, report dates, blocked popup, translated preview, invalid range clears old preview');
  await route(page, 'data');
  for (const [field, value] of Object.entries({ site_id: 'USER-02', altitude_m: '2800', temp_c: '1', rh_percent: '60.5', raw_nh3_ppm: '0', device_model: '' })) await page.locator('#manual-' + field).fill(value);
  await page.locator('#manualDataForm button').click();
  assert.equal(await page.evaluate(() => QJZH.dataImport.getRecords().length), 2);
  let confirmations = 0;
  const dismiss = dialog => { confirmations += 1; dialog.dismiss(); };
  page.on('dialog', dismiss);
  await page.locator('#loadSampleData').click();
  assert.equal(confirmations, 1);
  assert.equal(await page.evaluate(() => QJZH.dataImport.getRecords().length), 2);
  page.off('dialog', dismiss);
  const second = await context.newPage();
  await second.goto(base + '#/data', { waitUntil: 'networkidle' });
  await second.evaluate(() => localStorage.clear());
  await page.waitForFunction(() => document.getElementById('dataStorageSummary').textContent.includes('0 / 5000'));
  assert.equal(await page.evaluate(() => QJZH.dataImport.getRecords().length), 0);
  await second.close();
  evidence.flows.push('manual decimal/optional device, sample replacement confirmation, cross-tab clear synchronization');
  await page.addScriptTag({ path: axeScript });
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['dark', 'light']) {
      await page.locator(`[data-theme-value="${theme}"]`).click();
      for (const lang of ['zh', 'en', 'bo']) {
        await page.locator('#languageSelect').selectOption(lang);
        for (const view of ['overview', 'data', 'algorithm', 'decision', 'institution', 'report']) {
          await route(page, view);
          // Scan the settled view after its 240 ms entry and navigation transitions.
          await page.waitForTimeout(260);
          const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, views: [...document.querySelectorAll('.view')].filter(e => !e.hidden).length, focused: document.activeElement.tagName === 'H2' }));
          assert.equal(metrics.overflow, false, `${width}/${theme}/${lang}/${view} overflow`);
          assert.equal(metrics.views, 1);
          const scan = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
          evidence.matrix.push({ width, theme, lang, view, ...metrics });
          for (const issue of scan.violations) evidence.accessibility.push({ width, theme, lang, view, id: issue.id, impact: issue.impact, targets: issue.nodes.map(node => node.target) });
          if (lang === 'zh' && theme === 'dark' && [360, 1440].includes(width) && ['overview', 'data', 'report'].includes(view)) await page.screenshot({ path: path.join(out, `${width}-${view}.png`), fullPage: true });
        }
      }
    }
  }
  // Verify the fallback from a fresh navigation with storage getters blocked.
  const restricted = await browser.newContext({ reducedMotion: 'reduce' });
  await restricted.addInitScript(() => { for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, { get() { throw new DOMException('Blocked', 'SecurityError'); } }); });
  const memoryPage = await restricted.newPage();
  memoryPage.on('pageerror', error => evidence.pageErrors.push(error.message));
  await memoryPage.route('https://cdn.jsdelivr.net/**', request => request.abort());
  await memoryPage.goto(base + '#/data', { waitUntil: 'networkidle' });
  await memoryPage.locator('#loadSampleData').click();
  assert.equal(await memoryPage.evaluate(() => QJZH.dataImport.storage()), 'memory');
  assert.equal(await memoryPage.evaluate(() => QJZH.dataImport.getRecords().length), 16);
  await memoryPage.evaluate(() => QJZH.demoReset.clear());
  assert.equal(await memoryPage.evaluate(() => QJZH.dataImport.getRecords().length), 0);
  evidence.flows.push('blocked storage getters, in-memory save/reset, unavailable Chart.js fallback');
  evidence.performance = await memoryPage.evaluate(header => {
    const csv = header + '\n' + Array.from({ length: 5000 }, (_, i) => `${new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()},PERF-01,2620,-5,62,0,sensor`).join('\n');
    const start = performance.now(); const parsed = QJZH.dataImport.parseCsv(csv); const parsedAt = performance.now(); const saved = QJZH.dataImport.save(parsed.records); const savedAt = performance.now();
    for (let i = 0; i < 60; i++) QJZH.dataImport.nextRecord('PERF-01');
    return { rows: QJZH.dataImport.getRecords().length, ok: saved.ok, parseMs: parsedAt - start, saveMs: savedAt - parsedAt, replay60Ms: performance.now() - savedAt };
  }, header);
  assert.equal(evidence.performance.rows, 5000); assert.equal(evidence.performance.ok, true);
  await restricted.close();
  assert.deepEqual(evidence.pageErrors, []);
  assert.equal(evidence.accessibility.length, 0, 'WCAG A/AA violations: see browser evidence JSON');
  console.log(JSON.stringify({ combinations: evidence.matrix.length, accessibilityViolations: evidence.accessibility.length, flows: evidence.flows, performance: evidence.performance }, null, 2));
} finally {
  fs.writeFileSync(path.join(out, 'browser-evidence.json'), JSON.stringify(evidence, null, 2));
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
