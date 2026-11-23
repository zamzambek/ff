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

  const prev = window.CHAR_UPDATE;
  window.CHAR_UPDATE = (t) => { if (prev) prev(t); fx.forEach((f) => f(t)); };
})();
