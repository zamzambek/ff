/* Силуэтные люди в стиле кинематографичных притч: взрослые пропорции (~7.5 голов),
 * суставы плечо–локоть и бедро–колено, естественная походка, позы, контровой свет (CSS-фильтр .sil).
 *
 * <div class="person sil" data-person="boy|girl" style="left:..;top:..;height:..px"
 *      data-pose="s1:phone,s3:stand"  — позы: stand phone reach chest sit read look lookup down hold
 *      data-walk="s1-s1#4:-400"       — пройти с dx (px) к своей позиции в этом интервале
 *      data-face="left|right">        — куда смотрит (по умолчанию right)
 * Высота элемента задаёт рост; viewBox 200×600, ступни на y≈592.
 */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (x) => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const K = '#000';

  // углы в градусах; для взгляда вправо: минус = вперёд (вправо)
  const POSES = {
    stand:   { sL: 4, eL: -6, sR: -4, eR: -8, hL: -1, kL: 3, hR: 2, kR: 3, head: 0, lean: 0, drop: 0 },
    phone:   { sL: 6, eL: -8, sR: -28, eR: -112, hL: -1, kL: 3, hR: 2, kR: 3, head: 14, lean: 2, drop: 0 },
    reach:   { sL: 4, eL: -6, sR: -78, eR: -12, hL: -2, kL: 3, hR: 4, kR: 4, head: -2, lean: 3, drop: 0 },
    chest:   { sL: -6, eL: -120, sR: -10, eR: -125, hL: -1, kL: 3, hR: 2, kR: 3, head: 10, lean: 1, drop: 0 },
    hold:    { sL: -24, eL: -96, sR: -28, eR: -92, hL: -1, kL: 3, hR: 2, kR: 3, head: 8, lean: 2, drop: 0 },
    lookup:  { sL: 6, eL: -6, sR: -6, eR: -8, hL: -1, kL: 3, hR: 2, kR: 3, head: -18, lean: -2, drop: 0 },
    down:    { sL: 8, eL: -4, sR: 6, eR: -4, hL: -1, kL: 4, hR: 2, kR: 4, head: 22, lean: 4, drop: 0 },
    sit:     { sL: -8, eL: -50, sR: -10, eR: -55, hL: -86, kL: 88, hR: -82, kR: 84, head: 10, lean: 4, drop: 1 },
    read:    { sL: -40, eL: -48, sR: -44, eR: -44, hL: -86, kL: 88, hR: -82, kR: 84, head: 20, lean: 10, drop: 1 },
    sithold: { sL: -26, eL: -92, sR: -30, eR: -88, hL: -86, kL: 88, hR: -82, kR: 84, head: 12, lean: 4, drop: 1 },
    sitphone:{ sL: -10, eL: -50, sR: -30, eR: -105, hL: -86, kL: 88, hR: -82, kR: 84, head: 16, lean: 4, drop: 1 },
  };

  function parseKeys(s) {
    return (s || '').split(',').filter(Boolean).map((kv) => { const i = kv.lastIndexOf(':'); return { t: window.AT(kv.slice(0, i).trim()), v: kv.slice(i + 1).trim() }; }).sort((a, b) => a.t - b.t);
  }

  function limb(parent, x, y, len1, w1, len2, w2, end) {
    // верхний сегмент поворачивается вокруг (x,y), нижний — вокруг (x, y+len1)
    const g1 = el('g', {}, parent);
    el('line', { x1: x, y1: y, x2: x, y2: y + len1, stroke: K, 'stroke-width': w1, 'stroke-linecap': 'round' }, g1);
    const g2 = el('g', {}, g1);
    el('line', { x1: x, y1: y + len1, x2: x, y2: y + len1 + len2, stroke: K, 'stroke-width': w2, 'stroke-linecap': 'round' }, g2);
    if (end === 'hand') el('ellipse', { cx: x, cy: y + len1 + len2 + 6, rx: 6.5, ry: 9, fill: K }, g2);
    if (end === 'foot') el('path', { d: `M${x - 7} ${y + len1 + len2 - 4} q4 10 24 9 q4 -2 0 -8 z`, fill: K }, g2);
    return { g1, g2, x, y, len1 };
  }

  function build(root, kind) {
    const svg = el('svg', { viewBox: '0 0 200 600', height: '100%', style: 'overflow:visible;display:block' }, root);
    const flip = el('g', {}, svg);
    const all = el('g', {}, flip);
    const girl = kind === 'girl';
    // дальняя рука и нога (за телом)
    const armL = limb(all, 96, 150, 92, 15, 88, 12, 'hand');
    const legL = limb(all, 96, 318, 132, girl ? 21 : 25, 132, girl ? 15 : 19, 'foot');
    // туловище
    const body = el('g', {}, all);
    if (girl) {
      el('path', { d: 'M82 140 Q100 130 118 140 L122 200 Q116 236 112 262 Q140 380 146 450 Q100 466 54 450 Q62 380 88 262 Q84 236 78 200 Z', fill: K }, body);
    } else {
      el('path', { d: 'M76 142 Q100 130 124 142 L128 226 Q126 296 120 330 L80 330 Q74 296 72 226 Z', fill: K }, body);
      el('path', { d: 'M74 226 Q70 262 78 300 L84 300 Z', fill: K }, body);
    }
    el('rect', { x: 93, y: 104, width: 14, height: 34, rx: 6, fill: K }, body); // шея
    // голова и волосы
    const head = el('g', {}, all);
    // волосы в профиль: чёлка спереди, длинная прядь по спине
    if (girl) el('path', { d: 'M120 62 C122 40 104 34 92 38 C76 42 70 58 72 80 C70 120 64 180 70 238 C76 246 86 244 90 236 C86 190 86 140 90 104 L96 96 C104 74 112 60 120 62 Z', fill: K }, head);
    el('ellipse', { cx: 100, cy: 74, rx: 23, ry: 30, fill: K }, head);
    el('path', { d: 'M110 86 q10 4 12 10 q-6 4 -12 2 z', fill: K }, head); // нос/подбородок — профиль
    if (!girl) el('path', { d: 'M76 66 C74 36 96 30 110 36 C122 30 130 46 124 62 C118 52 108 50 100 54 C92 48 82 54 76 66 Z', fill: K }, head);
    // ближняя нога и рука (перед телом)
    const legR = limb(all, 104, 318, 132, girl ? 21 : 25, 132, girl ? 15 : 19, 'foot');
    const armR = limb(all, 104, 150, 92, 15, 88, 12, 'hand');
    return { svg, flip, all, armL, armR, legL, legR, head, body };
  }

  const people = [...document.querySelectorAll('.person')].map((root, i) => {
    const P = build(root, root.dataset.person);
    const d = root.dataset;
    const walk = (d.walk || '').split(',').filter(Boolean).map((w) => {
      const m = w.match(/^(.+?)-(s\d+.*?):(-?[\d.]+)$/);
      return { a: window.AT(m[1]), b: window.AT(m[2]), dx: parseFloat(m[3]) };
    });
    const h = root.getBoundingClientRect().height || parseFloat(root.style.height) || 600;
    return { root, P, walk, pose: parseKeys(d.pose), face: d.face === 'left' ? -1 : 1, scale: h / 600, ph: i * 1.7 };
  });

  const rot = (g, a, x, y) => g.setAttribute('transform', `rotate(${a} ${x} ${y})`);

  function update(t) {
    for (const p of people) {
      if (p.root.closest('.scene')?.style.display === 'none') continue;
      const { P } = p;
      // поза: плавный переход 0.6 c
      let cur = 'stand', since = -1e9, prev = 'stand';
      for (const k of p.pose) if (t >= k.t) { prev = cur; cur = k.v; since = k.t; }
      const A = POSES[prev] || POSES.stand, B = POSES[cur] || POSES.stand;
      const u = smooth((t - since) / 0.6);
      const q = {};
      for (const k in B) q[k] = A[k] + (B[k] - A[k]) * u;
      // ходьба
      let dx = 0, walking = false;
      for (const w of p.walk) {
        if (t < w.a) dx += w.dx;
        else if (t < w.b) { const v = (t - w.a) / (w.b - w.a); dx += w.dx * (1 - v); walking = true; }
      }
      let bob = 0;
      if (walking) {
        const ph = t * 2 * Math.PI * 0.95;
        const s = Math.sin(ph);
        q.hL = -22 * s; q.hR = 22 * s;
        q.kL = 6 + 34 * Math.max(0, Math.sin(ph + 1.3)); q.kR = 6 + 34 * Math.max(0, Math.sin(ph + 1.3 + Math.PI));
        if (cur === 'stand') { q.sL = 16 * s; q.sR = -16 * s; q.eL = -12; q.eR = -12; }
        bob = -Math.abs(Math.cos(ph)) * 7;
        q.lean = 3;
      }
      // дыхание
      const breath = Math.sin(t * 1.6 + p.ph) * 1.2;
      p.root.style.transform = `translate(${dx}px, ${bob * p.scale}px)`;
      P.flip.setAttribute('transform', p.face < 0 ? 'translate(200 0) scale(-1 1)' : '');
      const drop = q.drop * 128;   // сидя: таз опускается до уровня сиденья
      P.all.setAttribute('transform', `translate(0 ${drop}) rotate(${q.lean + breath * 0.3} 100 320)`);
      rot(P.legL.g1, q.hL, 96, 318); rot(P.legL.g2, q.kL, 96, 450);
      rot(P.legR.g1, q.hR, 104, 318); rot(P.legR.g2, q.kR, 104, 450);
      rot(P.armL.g1, q.sL + breath, 96, 150); rot(P.armL.g2, q.eL, 96, 242);
      rot(P.armR.g1, q.sR - breath, 104, 150); rot(P.armR.g2, q.eR, 104, 242);
      rot(P.head, q.head, 100, 112);
    }
  }

  const prevU = window.CHAR_UPDATE;
  window.CHAR_UPDATE = (t) => { if (prevU) prevU(t); update(t); };
})();
