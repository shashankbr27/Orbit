/**
 * Screenshot ORBIT in a real browser.
 *
 * Visual work on a canvas cannot be verified by reading the code, so this
 * drives headless Chrome against a running build, performs a scripted set of
 * gestures, and writes a PNG. It found most of the bugs worth finding:
 * translucent planets, a glow sprite with a visible rim, hard-edged surface
 * streaks, bottom sheets landing at the top of the page.
 *
 * Not part of the app and not a dependency of it. To use:
 *
 *   npm run build && npm run start -- -p 3111        # in one terminal
 *   npm i --no-save puppeteer-core                   # once
 *   node scripts/screenshot.mjs out/multiverse
 *
 * Environment:
 *   ORBIT_URL   base url                       (default http://localhost:3111)
 *   CHROME      path to a Chrome/Edge binary
 *   W, H        viewport size                  (default 390x844)
 *   DSF         device scale factor            (default 2)
 *   MOBILE      0 to present as a desktop      (default 1)
 *   WAIT        ms to settle before the shot   (default 7000)
 *   DISMISS     0 to keep the gift intro       (default 1)
 *   STEPS       comma-separated gestures, e.g.
 *               "tapcentre,wait3000,zoomin,pinch,aria:Settings,text:Open,
 *                press:0.5x0.5,drag:0.5x0.5>0.3x0.8,tap:0.6x0.9"
 *
 * Software rendering runs at a few frames a second, and the frame loop clamps
 * dt, so simulated time lags wall time — give WAIT generous values (and prefer
 * DSF=1 for large viewports) or you will screenshot a camera mid-flight.
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHROME =
  process.env.CHROME ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => existsSync(p));

if (!CHROME) {
  console.error('No Chrome/Edge found. Set CHROME=/path/to/chrome.');
  process.exit(1);
}
const BASE = process.env.ORBIT_URL || 'http://localhost:3111';
const OUT = process.argv[2] || 'shot';
const W = parseInt(process.env.W || '390', 10);
const H = parseInt(process.env.H || '844', 10);
const WAIT = parseInt(process.env.WAIT || '7000', 10);
const MOBILE = process.env.MOBILE !== '0';
const DISMISS = process.env.DISMISS !== '0';
const STEPS = process.env.STEPS || '';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader', `--window-size=${W},${H}`,
  ],
});
const page = await browser.newPage();
const DSF = parseFloat(process.env.DSF || '2');
await page.setViewport({ width: W, height: H, deviceScaleFactor: DSF, isMobile: MOBILE, hasTouch: MOBILE });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5500));

if (DISMISS) {
  let clicked = false;
  for (let i = 0; i < 40 && !clicked; i++) {
    clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /look around/i.test(b.textContent || ''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clicked) await new Promise((r) => setTimeout(r, 500));
  }
  logs.push(`[info] dismissed gift: ${clicked}`);
}
await new Promise((r) => setTimeout(r, WAIT));

// Optional scripted interactions, e.g. STEPS="tapcentre"
for (const step of STEPS.split(',').filter(Boolean)) {
  if (step === 'tapcentre') {
    await page.mouse.click(W / 2, H / 2);
  } else if (step === 'zoomin') {
    await page.mouse.move(W / 2, H / 2);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel({ deltaY: -120 });
      await new Promise((r) => setTimeout(r, 40));
    }
  } else if (step === 'add') {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        x.getAttribute('aria-label') === 'Add something');
      b?.click();
    });
  } else if (step === 'settings') {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        x.getAttribute('aria-label') === 'Settings');
      b?.click();
    });
  } else if (step.startsWith('wait')) {
    await new Promise((r) => setTimeout(r, parseInt(step.slice(4), 10) || 1000));
  } else if (step.startsWith('aria:')) {
    const label = step.slice(5);
    const ok = await page.evaluate((l) => {
      const b = [...document.querySelectorAll('button')].find(
        (x) => x.getAttribute('aria-label') === l);
      if (b) { b.click(); return true; }
      return false;
    }, label);
    logs.push(`[info] aria:${label} -> ${ok}`);
  } else if (step.startsWith('text:')) {
    const t = step.slice(5);
    const ok = await page.evaluate((needle) => {
      const b = [...document.querySelectorAll('button')].find(
        (x) => (x.textContent || '').trim().toLowerCase().includes(needle.toLowerCase()));
      if (b) { b.click(); return true; }
      return false;
    }, t);
    logs.push(`[info] text:${t} -> ${ok}`);
  } else if (step.startsWith('pinch')) {
    // Real two-finger pinch via CDP: puppeteer's touchscreen is single-touch.
    const out = step.includes('out');
    const cdp = await page.createCDPSession();
    const cx = W / 2;
    const cy = H / 2;
    const start = out ? 180 : 60;
    const end = out ? 60 : 200;
    const pt = (d) => [
      { x: cx - d / 2, y: cy, id: 1 },
      { x: cx + d / 2, y: cy, id: 2 },
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(start) });
    for (let i = 1; i <= 14; i++) {
      const d = start + ((end - start) * i) / 14;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(d) });
      await new Promise((r) => setTimeout(r, 50));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else if (step.startsWith('press:')) {
    const [fx, fy] = step.slice(6).split('x').map(Number);
    await page.mouse.move(W * fx, H * fy);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 750));
    await page.mouse.up();
  } else if (step.startsWith('drag:')) {
    const [from, to] = step.slice(5).split('>');
    const [ax, ay] = from.split('x').map(Number);
    const [bx, by] = to.split('x').map(Number);
    await page.mouse.move(W * ax, H * ay);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(W * (ax + ((bx - ax) * i) / 12), H * (ay + ((by - ay) * i) / 12));
      await new Promise((r) => setTimeout(r, 60));
    }
    await page.mouse.up();
  } else if (step.startsWith('tap:')) {
    const [fx, fy] = step.slice(4).split('x').map(Number);
    await page.mouse.click(W * fx, H * fy);
  }
  await new Promise((r) => setTimeout(r, 1400));
}

await page.screenshot({ path: `${OUT}.png` });
console.log(logs.filter((l) => !l.startsWith('[info]')).slice(0, 40).join('\n') || '(no errors)');
console.log(logs.filter((l) => l.startsWith('[info]')).join('\n'));
await browser.close();
