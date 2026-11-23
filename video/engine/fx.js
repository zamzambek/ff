/* Атмосферные эффекты для кинематографичного стиля (детерминированные по времени t).
 *   <div class="rain" data-drops="140" data-speed="1"></div>   дождь внутри контейнера
 *   <div class="steam" data-puffs="10"></div>                   пар/дым, поднимается вверх
 *   <div class="windows" data-cols="8" data-rows="12" data-off="s4#2">  окна дома, гаснут после времени off
 */
(function () {
  const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  const fx = [];

  document.querySelectorAll('.rain').forEach((box) => {
    const n = +box.dataset.drops || 140, sp = +box.dataset.speed || 1;
    const drops = [];
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'drop';
      const len = 30 + rnd(i, 1) * 50;
      d.style.cssText = `position:absolute;left:${rnd(i, 2) * 100}%;top:0;width:2px;height:${len}px;` +
        `background:linear-gradient(transparent,rgba(200,215,255,${0.25 + rnd(i, 3) * 0.4}));transform-origin:top`;
      box.appendChild(d);
      drops.push({ d, v: (1400 + rnd(i, 4) * 900) * sp, ph: rnd(i, 5) });
    }
    fx.push((t) => {
      const H = box.clientHeight || 1920;
      for (const p of drops) {
        const y = ((t * p.v / H + p.ph) % 1) * (H + 120) - 120;
        p.d.style.transform = `translate(${-y * 0.08}px, ${y}px) rotate(5deg)`;
      }
    });
  });

  document.querySelectorAll('.steam').forEach((box) => {
    const n = +box.dataset.puffs || 10;
    const from = box.dataset.from ? window.AT(box.dataset.from) : -1e9;
    const power = +box.dataset.power || 1;
    const puffs = [];
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      const s = 40 + rnd(i, 1) * 60;
      d.style.cssText = `position:absolute;left:${-s / 2}px;top:${-s / 2}px;width:${s}px;height:${s}px;border-radius:50%;` +
        `background:radial-gradient(circle,rgba(255,255,255,.55),rgba(255,255,255,0) 70%)`;
      box.appendChild(d);
      puffs.push({ d, ph: i / n, dx: (rnd(i, 2) - 0.5) * 120 });
    }
    fx.push((t) => {
      const on = t >= from;
      for (const p of puffs) {
        const u = ((t * 0.55 * power + p.ph) % 1);
        p.d.style.opacity = on ? Math.sin(u * Math.PI) * 0.9 : 0;
        p.d.style.transform = `translate(${p.dx * u + Math.sin(u * 6 + p.ph * 9) * 20}px, ${-u * 420 * power}px) scale(${0.6 + u * 2.4})`;
      }
    });
  });

  document.querySelectorAll('.windows').forEach((box) => {
    const cols = +box.dataset.cols || 8, rows = +box.dataset.rows || 12;
    const off = box.dataset.off ? window.AT(box.dataset.off) : 1e9;
    const keep = (box.dataset.keep || '').split(',').filter(Boolean).map(Number);
    const cells = [];
    box.style.display = 'grid';
    box.style.gridTemplateColumns = `repeat(${cols},1fr)`;
    box.style.gap = '18px';
    for (let i = 0; i < cols * rows; i++) {
      const w = document.createElement('div');
      w.style.cssText = 'height:46px;border-radius:4px;';
      box.appendChild(w);
      cells.push({ w, lit: rnd(i, 7) > 0.35, at: off + rnd(i, 8) * 2.2, keep: keep.includes(i) });
    }
    fx.push((t) => {
      for (const c of cells) {
        const on = c.keep || (c.lit && t < c.at);
        c.w.style.background = on ? (c.keep ? '#FFD38A' : 'rgba(255,205,120,.75)') : 'rgba(255,255,255,.05)';
        c.w.style.boxShadow = c.keep ? '0 0 30px rgba(255,200,110,.8)' : 'none';
      }
    });
  });

  document.querySelectorAll('.bokeh').forEach((box) => {
    const n = +box.dataset.n || 14;
    const items = [];
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      const s = 40 + rnd(i, 11) * 110;
      const warm = rnd(i, 12) > 0.5;
      d.style.cssText = `position:absolute;left:${rnd(i, 13) * 100}%;top:${rnd(i, 14) * 100}%;width:${s}px;height:${s}px;border-radius:50%;` +
        `background:radial-gradient(circle,${warm ? 'rgba(255,190,120,.16)' : 'rgba(150,170,255,.12)'},rgba(0,0,0,0) 70%);border:1px solid rgba(255,255,255,.04)`;
      box.appendChild(d);
      items.push({ d, ph: rnd(i, 15) * 6.28, sp: 0.2 + rnd(i, 16) * 0.3 });
    }
    fx.push((t) => { for (const b of items) b.d.style.transform = `translate(${Math.sin(t * b.sp + b.ph) * 30}px, ${Math.cos(t * b.sp * 0.8 + b.ph) * 20}px)`; });
  });

  // огонь вдоль низа: <div class="fire" data-n="40" data-from="s9#5">
  document.querySelectorAll('.fire').forEach((box) => {
    const n = +box.dataset.n || 40, from = box.dataset.from ? window.AT(box.dataset.from) : -1e9;
    const fl = [];
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      const w = 40 + rnd(i, 21) * 70, h = 90 + rnd(i, 22) * 190;
      d.style.cssText = `position:absolute;bottom:0;left:${(i / n) * 100 + (rnd(i, 23) - 0.5) * 3}%;width:${w}px;height:${h}px;margin-left:${-w / 2}px;` +
        `border-radius:50% 50% 40% 40% / 70% 70% 30% 30%;transform-origin:50% 100%;` +
        `background:radial-gradient(ellipse at 50% 85%,#FFF2B0 0%,#FFB33A 30%,#FF5A1F 60%,rgba(200,30,10,0) 80%);mix-blend-mode:screen`;
      box.appendChild(d);
      fl.push({ d, ph: rnd(i, 24) * 6.28, sp: 7 + rnd(i, 25) * 6 });
    }
    fx.push((t) => {
      const grow = Math.min(1, Math.max(0, (t - from) / 0.8));
      for (const f of fl) f.d.style.transform = `scaleY(${grow * (0.75 + 0.25 * Math.sin(t * f.sp + f.ph) + 0.1 * Math.sin(t * 17 + f.ph))}) scaleX(${0.9 + 0.1 * Math.sin(t * 9 + f.ph)})`;
    });
  });

  // ночной город: <div class="skyline" data-seed="1" data-color="#0A0C26" data-win="rgba(255,205,120,.8)" data-h="420">
  document.querySelectorAll('.skyline').forEach((box) => {
    const seed = +box.dataset.seed || 1, H = +box.dataset.h || 400;
    const col = box.dataset.color || '#0A0C26', win = box.dataset.win || 'rgba(255,205,120,.75)';
    let x = 0, i = 0;
    const W = box.clientWidth || 1920;
    while (x < W) {
      const bw = 70 + rnd(seed * 100 + i, 31) * 110, bh = H * (0.35 + rnd(seed * 100 + i, 32) * 0.65);
      const b = document.createElement('div');
      b.style.cssText = `position:absolute;bottom:0;left:${x}px;width:${bw}px;height:${bh}px;background:${col}`;
      for (let wy = 18; wy < bh - 20; wy += 34) for (let wx = 12; wx < bw - 16; wx += 26) {
        if (rnd(seed * 1000 + i * 97 + wy + wx, 33) > 0.72) {
          const w = document.createElement('div');
          w.style.cssText = `position:absolute;left:${wx}px;top:${wy}px;width:10px;height:14px;background:${win}`;
          b.appendChild(w);
        }
      }
      box.appendChild(b);
      x += bw + 6; i++;
    }
  });

  // светящееся сердце: <div class="heart"> (размер — через width/height)
  document.querySelectorAll('.heart').forEach((h, i) => {
    h.innerHTML = `<svg viewBox="0 0 100 92" width="100%" height="100%" style="overflow:visible;display:block">
      <defs><radialGradient id="hg${i}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#FFE3E8"/><stop offset=".45" stop-color="#FF4D6D"/><stop offset="1" stop-color="#B0102C"/></radialGradient></defs>
      <path d="M50 88 C20 66 2 50 2 28 C2 12 14 2 28 2 C38 2 46 8 50 16 C54 8 62 2 72 2 C86 2 98 12 98 28 C98 50 80 66 50 88 Z" fill="url(#hg${i})"/>
      <ellipse cx="30" cy="24" rx="11" ry="7" fill="rgba(255,255,255,.55)" transform="rotate(-30 30 24)"/></svg>`;
  });

  const prev = window.CHAR_UPDATE;
  window.CHAR_UPDATE = (t) => { if (prev) prev(t); fx.forEach((f) => f(t)); };
})();
