#!/usr/bin/env node
// Drives a local Performance OS instance through headless Chrome CDP.
// Evidence files are written only when --out is set. This script never deletes them.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME = process.env.CHROME_BIN || '/usr/local/bin/google-chrome';
const BASE = process.env.VERIFY_URL || 'http://127.0.0.1:5173';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

const command = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
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
      }, 8000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.ws.send(JSON.stringify(body));
    });
  }
}

async function launchChrome() {
  const userData = mkdtempSync(join(tmpdir(), 'perfos-verify-'));
  const port = 9300 + Math.floor(Math.random() * 500);
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
      version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
      break;
    } catch {
      await delay(150);
    }
  }
  if (!version) {
    chrome.kill('SIGKILL');
    rmSync(userData, { recursive: true, force: true });
    fail('Chrome did not open a debugging port');
  }
  return { pid: chrome.pid, port, userData, browser: version.Browser, chrome };
}

async function openPage(port) {
  const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
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
    deviceScaleFactor: 2,
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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'page evaluation failed');
  }
  return result.result?.value;
}

async function gotoReady(page, url) {
  await page.cdp.send('Page.navigate', { url }, page.sessionId);
  const started = Date.now();
  while (Date.now() - started < 15000) {
    const ready = await evalIn(page, `document.readyState === 'complete' && !!(document.getElementById('root') && document.getElementById('root').textContent.trim())`);
    if (ready) return;
    await delay(200);
  }
  fail(`Page did not become usable at ${url}`);
}

async function withPage(fn) {
  const meta = await launchChrome();
  console.error(JSON.stringify({ pid: meta.pid, port: meta.port, browser: meta.browser }));
  let page;
  try {
    page = await openPage(meta.port);
    await fn(page);
  } finally {
    try { meta.chrome.kill('SIGKILL'); } catch { /* already gone */ }
    try { page?.ws.close(); } catch { /* already closed */ }
    try { rmSync(meta.userData, { recursive: true, force: true }); } catch { /* Chrome may still be releasing the profile. */ }
  }
}

async function commandDoctor() {
  const response = await fetch(BASE);
  if (!response.ok) fail(`doctor fail: ${BASE} returned ${response.status}`);
  const html = await response.text();
  const titleOk = html.includes('<title>Performance OS</title>');
  const moduleOk = html.includes('/src/main.tsx');
  console.log(JSON.stringify({
    ok: titleOk && moduleOk,
    url: BASE,
    title: titleOk ? 'Performance OS' : null,
    devModule: moduleOk,
  }));
  if (!titleOk || !moduleOk) process.exit(1);
}

async function commandText() {
  const url = arg('--url', `${BASE}/login`);
  await withPage(async (page) => {
    await gotoReady(page, url);
    const text = await evalIn(page, 'document.body.innerText');
    const href = await evalIn(page, 'location.href');
    console.log(JSON.stringify({ href, text }, null, 2));
  });
}

async function commandClick() {
  const name = arg('--name');
  const url = arg('--url', `${BASE}/login`);
  if (!name) fail('click requires --name');
  await withPage(async (page) => {
    await gotoReady(page, url);
    const clicked = await evalIn(page, `(() => {
      const name = ${JSON.stringify(name)};
      const nodes = [...document.querySelectorAll('button, a, [role="button"]')];
      const node = nodes.find(el => (el.getAttribute('aria-label') || el.innerText || '').trim().includes(name));
      if (!node) return { ok: false, labels: nodes.map(el => (el.getAttribute('aria-label') || el.innerText || '').trim()).slice(0, 20) };
      node.click();
      return { ok: true };
    })()`);
    if (!clicked?.ok) fail(`No control named ${name}. Seen: ${JSON.stringify(clicked?.labels)}`);
    await delay(1500);
    const href = await evalIn(page, 'location.href');
    const text = await evalIn(page, 'document.body.innerText');
    console.log(JSON.stringify({ clicked: name, href, text }, null, 2));
  });
}

async function commandShot() {
  const url = arg('--url', `${BASE}/login`);
  const out = arg('--out');
  if (!out) fail('shot requires --out');
  await withPage(async (page) => {
    await gotoReady(page, url);
    const shot = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    const text = await evalIn(page, 'document.body.innerText');
    const textPath = out.replace(/\.png$/, '.txt');
    writeFileSync(textPath, text);
    console.log(JSON.stringify({ screenshot: out, text: textPath }));
  });
}

const commands = { doctor: commandDoctor, text: commandText, click: commandClick, shot: commandShot };

if (!commands[command]) {
  fail('Usage: drive.mjs doctor|text|click|shot [--url URL] [--name LABEL] [--out FILE]');
}

await commands[command]();
