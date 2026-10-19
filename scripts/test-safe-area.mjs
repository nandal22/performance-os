#!/usr/bin/env node
// Visual check at 390x844 with a simulated 47px top inset. Never uses the live database.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME = process.env.CHROME_BIN || [
  '/usr/local/bin/google-chrome',
  '/usr/bin/google-chrome',
  '/opt/google/chrome/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(path => existsSync(path)) || '/usr/local/bin/google-chrome';
const PORT = 5179;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.env.SAFE_AREA_OUT
  || (existsSync('/opt/cursor/artifacts') ? '/opt/cursor/artifacts/screenshots' : join(tmpdir(), 'perfos-safe-area'));
const TOP = 47;
const BOTTOM = 34;

function fail(message) {
  console.error(message);
  process.exit(1);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 1;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const waiter = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result || {});
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.next++;
    const body = { id, method, params };
    if (sessionId) body.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.ws.send(JSON.stringify(body));
    });
  }
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const response = await fetch(`${BASE}/__shot?shot=progress`);
      if (response.ok) return;
    } catch {
      // Vite is still booting.
    }
    await delay(200);
  }
  fail('Vite did not start');
}

async function launchChrome() {
  const userData = mkdtempSync(join(tmpdir(), 'perfos-safe-'));
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userData}`,
    'about:blank',
  ], { stdio: 'ignore' });
  const started = Date.now();
  let version;
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        version = await response.json();
        break;
      }
    } catch {
      await delay(150);
    }
  }
  if (!version) {
    chrome.kill('SIGKILL');
    fail('Chrome did not open a debugging port');
  }
  return { chrome, userData, version };
}

async function openPage(version) {
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 5000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP websocket failed')); }, { once: true });
  });
  const cdp = new Cdp(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  }, sessionId);
  return { ws, cdp, sessionId };
}

async function evalIn(page, expression) {
  const result = await page.cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, page.sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'page evaluation failed');
  return result.result?.value;
}

async function gotoReady(page, url, testId, timeoutMs = 20000) {
  await page.cdp.send('Page.navigate', { url }, page.sessionId);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await evalIn(page, `!!document.querySelector(${JSON.stringify(testId)})`);
    if (ready) return Date.now() - started;
    await delay(200);
  }
  const text = await evalIn(page, 'document.body.innerText').catch(() => '');
  throw new Error(`Page did not show ${testId} at ${url}. Text: ${String(text).slice(0, 240)}`);
}

function paintStatusBar(inset) {
  return `(() => {
    document.documentElement.style.setProperty('--sat', '${inset}px');
    document.documentElement.style.setProperty('--sab', '${BOTTOM}px');
    document.getElementById('sim-status')?.remove();
    const bar = document.createElement('div');
    bar.id = 'sim-status';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:${TOP}px;z-index:80;display:flex;align-items:flex-end;justify-content:space-between;padding:0 22px 6px;font:600 15px Archivo,sans-serif;color:#201e1d;pointer-events:none;background:${inset ? '#f3f2f2' : 'rgba(243,242,242,0.45)'};';
    bar.innerHTML = '<span>10:58</span><span>66</span>';
    document.body.appendChild(bar);
  })()`;
}

async function shot(page, name) {
  const image = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, name);
  writeFileSync(file, Buffer.from(image.data, 'base64'));
  return file;
}

async function measure(page) {
  return evalIn(page, `(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    };
    const nav = document.querySelector('[data-testid="bottom-nav"]');
    return {
      eyebrow: box('[data-testid="page-eyebrow"]'),
      header: box('[data-testid="page-header"]'),
      sheetHeader: box('[data-testid="sheet-header"]'),
      close: box('[data-testid="sheet-close"]'),
      safeBar: box('.sheet-safe-bar'),
      navPadding: nav ? getComputedStyle(nav).paddingBottom : null,
      headerPadding: (() => {
        const node = document.querySelector('[data-testid="page-header"]');
        return node ? getComputedStyle(node).paddingTop : null;
      })(),
    };
  })()`);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../src/components/BottomNav.tsx', import.meta.url), 'utf8');
const detailSource = readFileSync(new URL('../src/components/WorkoutDetailSheet.tsx', import.meta.url), 'utf8');
const progressSource = readFileSync(new URL('../src/pages/ProgressPage.tsx', import.meta.url), 'utf8');
record('viewport-fit=cover is set', html.includes('viewport-fit=cover'));
record('sticky header padding uses env(safe-area-inset-top)', css.includes('env(safe-area-inset-top, 0px)') && /\.pt-safe\s*\{[^}]*var\(--sat\)/.test(css) && progressSource.includes('pt-safe'));
record('sheets reserve env(safe-area-inset-top)', css.includes('height: var(--sat)') && detailSource.includes('sheet-safe-bar') && detailSource.includes('sheet-overlay'));
record('bottom nav uses env(safe-area-inset-bottom)', css.includes('env(safe-area-inset-bottom, 0px)') && nav.includes('pb-safe') && /\.pb-safe\s*\{[^}]*var\(--sab\)/.test(css));
if (results.some(result => !result.ok)) process.exit(1);

// The shot pages render fixtures, but the app still builds a Supabase client
// at import. Point it at an unused local address when no .env is present.
const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  // Own process group, so the cleanup below also stops the vite child that
  // npx starts. Otherwise it keeps serving port 5179 to the next run.
  detached: true,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'safe-area-test-anon-key',
  },
});

let chromeMeta;
let page;
try {
  await waitForServer();
  chromeMeta = await launchChrome();
  page = await openPage(chromeMeta.version);
  await page.cdp.send('Network.enable', {}, page.sessionId);

  const progressUrl = `${BASE}/__shot?shot=progress`;
  const detailUrl = `${BASE}/__shot?shot=detail`;

  await gotoReady(page, progressUrl, '[data-testid="page-eyebrow"]');
  await page.cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  }, page.sessionId);
  const progressMs = await gotoReady(page, progressUrl, '[data-testid="page-eyebrow"]', 45000);
  await page.cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  }, page.sessionId);
  await evalIn(page, paintStatusBar(0));
  await delay(100);
  const beforeProgress = await shot(page, 'progress-before.png');
  await evalIn(page, paintStatusBar(TOP));
  await delay(100);
  const afterProgress = await measure(page);
  const afterProgressFile = await shot(page, 'progress-after.png');
  const resources = await evalIn(page, `performance.getEntriesByType('resource').map(entry => ({ name: entry.name.split('/').pop(), bytes: entry.transferSize || entry.encodedBodySize || 0 }))`);

  await gotoReady(page, detailUrl, '[data-testid="sheet-header"]');
  await evalIn(page, paintStatusBar(0));
  await delay(100);
  const beforeDetail = await shot(page, 'detail-before.png');
  await evalIn(page, paintStatusBar(TOP));
  await delay(100);
  const afterDetail = await measure(page);
  const afterDetailFile = await shot(page, 'detail-after.png');

  const eyebrowTop = afterProgress.eyebrow?.top ?? 0;
  record('progress eyebrow clears a 47px top inset', eyebrowTop >= TOP, `top ${Math.round(eyebrowTop)}px`);
  record('progress header padding includes the top inset', Number.parseFloat(afterProgress.headerPadding) >= TOP, afterProgress.headerPadding);
  record('bottom nav padding includes the bottom inset', Number.parseFloat(afterProgress.navPadding) >= BOTTOM, afterProgress.navPadding);

  const closeTop = afterDetail.close?.top ?? 0;
  const headerTop = afterDetail.sheetHeader?.top ?? 0;
  record('workout sheet header clears a 47px top inset', headerTop >= TOP, `top ${Math.round(headerTop)}px`);
  record('workout sheet close button clears a 47px top inset', closeTop >= TOP, `top ${Math.round(closeTop)}px`);
  record('workout sheet safe bar is opaque and 47px', (afterDetail.safeBar?.height ?? 0) >= TOP - 1, `height ${Math.round(afterDetail.safeBar?.height ?? 0)}px`);

  await gotoReady(page, `${BASE}/__shot?shot=plan`, '[data-testid="today-plan"]');
  await evalIn(page, paintStatusBar(TOP));
  await delay(100);
  const planCard = await shot(page, 'plan-card.png');
  const planTop = await evalIn(page, `document.querySelector('[data-testid="today-plan"] h2')?.getBoundingClientRect().top ?? 0`);
  record('today plan title clears a 47px top inset', planTop >= TOP, `top ${Math.round(planTop)}px`);

  await gotoReady(page, `${BASE}/__shot?shot=plan-log`, '[data-testid="sheet-header"]');
  await evalIn(page, paintStatusBar(TOP));
  await delay(150);
  const planLog = await shot(page, 'plan-log.png');
  const logTop = await evalIn(page, `document.querySelector('[data-testid="sheet-header"]')?.getBoundingClientRect().top ?? 0`);
  record('plan log header clears a 47px top inset', logTop >= TOP, `top ${Math.round(logTop)}px`);

  const smallTargets = await evalIn(page, `JSON.stringify([...document.querySelectorAll('[role="dialog"] button, [data-testid="sheet-header"] button, section button')]
    .filter(el => el.offsetParent !== null)
    .map(el => ({ name: el.getAttribute('aria-label') || el.textContent.trim(), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) }))
    .filter(el => el.h < 44 || el.w < 44))`);
  record('plan log buttons are at least 44px', smallTargets === '[]', smallTargets);
  await evalIn(page, `document.querySelector('[data-testid="per-db"]')?.scrollIntoView({ block: 'center' })`);
  await delay(150);
  const planLogDb = await shot(page, 'plan-log-per-db.png');
  const perDb = await evalIn(page, `document.querySelector('[data-testid="per-db"]')?.textContent ?? ''`);
  record('plan log shows the per-dumbbell weight', /kg \/ DB$/.test(perDb), perDb);
  await evalIn(page, `document.querySelector('[data-testid="plan-cardio"]')?.scrollIntoView({ block: 'end' })`);
  await delay(150);
  const planLogCardio = await shot(page, 'plan-log-cardio.png');
  const cardioLast = await evalIn(page, `(() => { const cardio = document.querySelector('[data-testid="plan-cardio"]'); const groups = cardio ? [...cardio.parentElement.querySelectorAll(':scope > section')] : []; return groups.length + ':' + (groups[groups.length - 1]?.dataset.testid ?? ''); })()`);
  record('plan cardio item is listed last', /^[2-9]\d*:plan-cardio$/.test(cardioLast), cardioLast);

  await gotoReady(page, `${BASE}/__shot?shot=plan-view`, '[data-testid="sheet-header"]');
  await evalIn(page, paintStatusBar(TOP));
  await delay(150);
  const planView = await shot(page, 'plan-view.png');
  const viewState = await evalIn(page, `JSON.stringify({ header: document.querySelector('[data-testid="sheet-header"]')?.textContent ?? '', inputs: document.querySelectorAll('[data-testid="sheet-header"] ~ div input').length, start: [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Start workout').length, rows: document.querySelectorAll('[data-testid="plan-view-set"]').length, outbox: localStorage.getItem('perf-os-outbox') })`);
  const view = JSON.parse(viewState);
  record('plan view-only shows targets with no inputs and one Start button', /view only/i.test(view.header) && view.inputs === 0 && view.start === 1 && view.rows > 0, viewState);
  record('plan view-only queues no writes', !view.outbox || view.outbox === '[]', String(view.outbox));

  await gotoReady(page, `${BASE}/__shot?shot=plan-resumed`, '[data-testid="sheet-header"]');
  await evalIn(page, paintStatusBar(TOP));
  await delay(150);
  const planResumed = await shot(page, 'plan-resumed.png');
  const resumedText = await evalIn(page, `document.querySelector('[data-testid="sync-status"]')?.textContent ?? ''`);
  record('a resumed plan session shows its logged sets', /2 logged/.test(resumedText), resumedText);

  await gotoReady(page, `${BASE}/__shot?shot=plan-actual`, '[aria-label="Planned versus actual"]');
  await evalIn(page, paintStatusBar(TOP));
  await delay(100);
  const planActual = await shot(page, 'plan-actual.png');

  console.log(`      plan screenshots ${planCard} ${planLog} ${planLogDb} ${planLogCardio} ${planResumed} ${planView} ${planActual}`);
  console.log(`      progress first content ${progressMs}ms on throttled 4G at 390x844`);
  console.log(`      screenshots ${beforeProgress} ${afterProgressFile} ${beforeDetail} ${afterDetailFile}`);
  console.log(`      resources ${JSON.stringify(resources)}`);
} catch (error) {
  console.log(`FAIL  safe-area visual check  ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  try { page?.ws.close(); } catch { /* already closed */ }
  try { chromeMeta?.chrome.kill('SIGKILL'); } catch { /* already gone */ }
  try { if (chromeMeta) rmSync(chromeMeta.userData, { recursive: true, force: true }); } catch { /* profile busy */ }
  try { process.kill(-vite.pid, 'SIGKILL'); } catch { try { vite.kill('SIGKILL'); } catch { /* already gone */ } }
}

if (results.some(result => !result.ok)) process.exitCode = 1;
if (!results.length && !process.exitCode) {
  console.log('FAIL  safe-area visual check did not run');
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);
