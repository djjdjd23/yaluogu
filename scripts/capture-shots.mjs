import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, 'www');
const outDir = join(root, 'build', 'shots');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png' };

const server = await new Promise((res) => {
  const s = createServer((rq, rs) => {
    const u = decodeURIComponent(rq.url.split('?')[0]);
    const f = join(webDir, u === '/' ? 'index.html' : u);
    if (!existsSync(f)) { rs.statusCode = 404; rs.end('404'); return; }
    rs.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream');
    rs.end(readFileSync(f));
  });
  s.listen(0, '127.0.0.1', () => res(s));
});
const base = `http://127.0.0.1:${server.address().port}/`;
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

// 游戏在创建角色结束时会弹原生 confirm，无头浏览器必须自动应答，否则 JS 线程会挂住
page.on('dialog', async (d) => {
  console.log('[dialog]', d.type(), d.message().replace(/\s+/g, ' ').slice(0, 60), '-> accept');
  await d.accept();
});
page.setDefaultTimeout(15000);

await page.goto(base, { waitUntil: 'networkidle0' });
await sleep(1200);

const click = (s) => page.evaluate((x) => { const e = document.querySelector(x); if (!e) return 'NO'; e.click(); return 'OK'; }, s);
const clickNth = (s, i) => page.evaluate((x, n) => {
  const g = document.querySelector(x);
  if (!g || !g.children[n]) return 'NO';
  g.children[n].click(); return 'OK';
}, s, i);
const shot = (name) => page.screenshot({ path: join(outDir, name) });

const report = async (label) => {
  const d = await page.evaluate(() => ({
    title: document.title,
    story: (document.getElementById('story')?.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
    choices: [...document.querySelectorAll('.choice, .opt, [data-act]')].filter((n) => n.offsetParent).map((n) => (n.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 24)).slice(0, 6),
  }));
  console.log(`\n[${label}]`, JSON.stringify(d));
};

console.log('start', await click('#t-new')); await sleep(700);
console.log('slot', await click('.slot')); await sleep(700);
console.log('next1(身份->出身)', await click('#c-next')); await sleep(900);

console.log('origin[0]', await clickNth('.origin-grid', 0)); await sleep(700);
await shot('a1-origin.png');

console.log('next2(出身->属性)', await click('#c-next')); await sleep(900);
await shot('a2-attr.png');

// 属性页：直接跳过，会弹「还有 N 点没分配」的原生确认框
console.log('next3(属性->天赋)', await click('#c-next')); await sleep(1000);

// 天赋页：挑三个
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.talent-card')].slice(0, 3);
  cards.forEach((c) => c.click());
});
await sleep(600);
await shot('a3-talent.png');

console.log('next4(天赋->进入游戏)', await click('#c-next')); await sleep(1800);
await report('进入游戏');
await shot('a4-main.png');

// 推进几步剧情
for (let i = 0; i < 4; i++) {
  const ok = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.choice, .opt, [data-act]')].find((n) => n.offsetParent);
    if (!c) return 'NO CHOICE';
    c.click(); return (c.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  });
  console.log('choice ->', ok);
  await sleep(900);
  await shot(`b${i + 1}.png`);
}

await report('剧情推进后');

// 补一张：打开「档案」侧栏，展示领地经营面板
console.log('open side', await click('#btn-side'));
await sleep(700);
await shot('c1-side.png');

// 展开「领地」面板
await page.evaluate(() => {
  const h = [...document.querySelectorAll('.panel > .head')].find((n) => /领地/.test(n.innerText || ''));
  if (h && h.parentElement.classList.contains('closed')) h.click();
});
await sleep(700);
await shot('c2-side-land.png');

await browser.close();
server.close();
console.log('\n输出目录:', outDir);
