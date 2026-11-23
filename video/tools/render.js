#!/usr/bin/env node
// Рендер сцены в видео: каждый кадр = renderAt(t) + скриншот, кадры идут в ffmpeg.
//   node tools/render.js <project>                       → build/silent.mp4 + build/events.json
//   node tools/render.js <project> --stills 1,5.5,30     → build/stills/*.png (быстрая проверка)
//   node tools/render.js <project> --fps 15 --scale 0.5  → быстрый черновик
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const project = path.resolve(args[0] || '.');
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const fps = Number(opt('fps', 30));
const scale = Number(opt('scale', 1));
const stills = opt('stills', null);
const build = path.join(project, 'build');

(async () => {
  const timings = JSON.parse(fs.readFileSync(path.join(build, 'timings.json'), 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => { console.error('Ошибка в сцене:', e.message); process.exit(1); });
  await page.goto('file://' + path.join(project, 'scene.html'));
  await page.waitForFunction(() => window.ENGINE_READY === true);
  await page.evaluate(() => document.fonts.ready);

  if (stills) {
    const dir = path.join(build, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of stills.split(',').map(Number)) {
      await page.evaluate((t) => window.renderAt(t), t);
      await page.screenshot({ path: path.join(dir, `t${t.toFixed(2).padStart(6, '0')}.png`) });
    }
    console.log('кадры:', dir);
    await browser.close();
    return;
  }

  const events = await page.evaluate(() => window.collectEvents());
  fs.writeFileSync(path.join(build, 'events.json'), JSON.stringify(events));

  const total = timings.total;
  const n = Math.ceil(total * fps);
  const out = path.join(build, 'silent.mp4');
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });

  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.renderAt(t), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % (fps * 5) === 0) process.stdout.write(`\r  кадр ${i}/${n}  (${((Date.now() - t0) / 1000).toFixed(0)} c)`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
  console.log(`\nвидео без звука: ${out}`);
})();
