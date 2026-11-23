/* KAINAP characters: 2D-человечки на SVG, которые управляются временем t.
 *
 * <div class="char" data-char="aibek|tae|bact|yeast" style="left:..;top:..;width:..">
 *   data-pose="s4#5:give,s5:churn"   позы: idle give churn drink hold shrug point cheer wave
 *   data-expr="s7#3:shock,s8:happy"  лица: neutral happy smile shock sour sus effort wink tired
 *   data-prop="s4#5:stick,s5:none"   предмет в правой руке: stick bowl none
 *   data-walk="s4#0-s4#3:-500"       идти с dx=-500px к 0 в этом интервале
 *   data-face="left|right"           куда смотрят глаза
 * Время — как в engine.js (window.AT).
 */
(function () {
  const INK = '#12133F';
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (x) => { const u = clamp(x); return u * u * (3 - 2 * u); };

  const POSES = {            // углы рук от вертикали вниз (°), + по часовой
    idle:  { L: 14, R: -14 },
    give:  { L: 14, R: -80 },
    churn: { L: 40, R: -40 },
    drink: { L: 14, R: -150 },
    hold:  { L: 14, R: -165 },
    shrug: { L: 70, R: -70 },
    point: { L: 14, R: -110 },
    cheer: { L: 155, R: -155 },
    wave:  { L: 14, R: -150 },
    chest: { L: 14, R: 38 },
    hold2: { L: 80, R: -14 },
  };
  const MOUTH = {
    neutral: 'M108 132 h24',
    happy:   'M104 126 q16 18 32 0 z',
    smile:   'M106 128 q14 12 28 0',
    shock:   'M112 124 a8 11 0 1 0 16 0 a8 11 0 1 0 -16 0',
    sour:    'M104 132 q6 -7 12 0 q6 7 12 0 q6 -7 12 0',
    sus:     'M110 132 h22',
    effort:  'M106 128 h28 v6 h-28 z',
    wink:    'M104 126 q16 18 32 0 z',
    tired:   'M108 134 q12 -8 24 0',
  };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const parseKeys = (s) => (s || '').split(',').filter(Boolean).map((kv) => {
    const i = kv.lastIndexOf(':');
    return { t: window.AT(kv.slice(0, i).trim()), v: kv.slice(i + 1).trim() };
  }).sort((a, b) => a.t - b.t);
  const valueAt = (keys, t, def) => { let v = def, since = -1e9; for (const k of keys) if (t >= k.t) { v = k.v; since = k.t; } return { v, since }; };
  const prevValue = (keys, t, def) => { let p = def, v = def; for (const k of keys) if (t >= k.t) { p = v; v = k.v; } return p; };
  const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0) / 4294967295; };

  // ---------- построение человечка ----------
  function buildHuman(root, kind) {
    const svg = el('svg', { viewBox: '0 0 240 430', width: '100%', style: 'overflow:visible;display:block' }, root);
    const g = el('g', {}, svg);
    el('ellipse', { cx: 120, cy: 418, rx: 62, ry: 10, fill: 'rgba(10,10,60,.25)' }, g);
    const body = el('g', {}, g);
    const S = { 'stroke': INK, 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    // ноги
    const legL = el('g', {}, body), legR = el('g', {}, body);
    for (const [lg, x] of [[legL, 108], [legR, 132]]) {
      el('path', { d: `M${x} 300 V402`, ...S, fill: 'none', 'stroke-width': 10 }, lg);
      el('ellipse', { cx: x + (x < 120 ? -6 : 6), cy: 405, rx: 15, ry: 8, fill: INK }, lg);
    }
    // туловище / одежда
    if (kind === 'girl') {
      el('path', { d: 'M94 178 Q120 168 146 178 L166 318 Q120 330 74 318 Z', fill: '#E5484D', ...S, 'stroke-width': 7 }, body);
    } else if (kind === 'tae') {
      el('path', { d: 'M92 178 Q120 166 148 178 L170 330 Q120 344 70 330 Z', fill: '#FFFFFF', ...S, 'stroke-width': 7 }, body);
      el('path', { d: 'M96 182 Q120 172 144 182 L150 268 Q120 278 90 268 Z', fill: '#E5484D', ...S, 'stroke-width': 7 }, body);
    } else {
      el('rect', { x: 90, y: 176, width: 60, height: 130, rx: 28, fill: '#FFC83D', ...S, 'stroke-width': 7 }, body);
      el('path', { d: 'M120 186 V296', stroke: 'rgba(18,19,63,.25)', 'stroke-width': 4 }, body);
    }
    // руки (поворот вокруг плеча)
    const armL = el('g', {}, body), armR = el('g', {}, body);
    el('path', { d: 'M98 196 V286', ...S, fill: 'none' }, armL);
    el('circle', { cx: 98, cy: 290, r: 9, fill: INK }, armL);
    el('path', { d: 'M142 196 V286', ...S, fill: 'none' }, armR);
    el('circle', { cx: 142, cy: 290, r: 9, fill: INK }, armR);
    // предметы в правой руке
    const stick = el('g', { visibility: 'hidden' }, armR);
    el('path', { d: 'M142 150 V420', stroke: '#8A5426', 'stroke-width': 12, 'stroke-linecap': 'round' }, stick);
    el('path', { d: 'M142 150 V420', stroke: '#B8793A', 'stroke-width': 5, 'stroke-linecap': 'round' }, stick);
    el('path', { d: 'M116 412 h52 M142 398 v28', stroke: '#8A5426', 'stroke-width': 10, 'stroke-linecap': 'round' }, stick);
    const bowl = el('g', { visibility: 'hidden' }, armR);
    el('path', { d: 'M114 286 h56 q-4 30 -28 30 q-24 0 -28 -30 z', fill: '#fff', ...S, 'stroke-width': 6 }, bowl);
    el('path', { d: 'M120 296 h44', stroke: '#3A3CF4', 'stroke-width': 4 }, bowl);
    // голова-боб
    const head = el('g', {}, g);
    el('path', { d: 'M120 46 C164 46 178 82 176 116 C174 154 152 174 120 174 C88 174 66 154 64 116 C62 82 76 46 120 46 Z', fill: '#FFE1C4', ...S, 'stroke-width': 8 }, head);
    if (kind === 'girl') {
      // волосы и две косички
      el('path', { d: 'M64 112 C58 40 182 40 176 112 C168 82 148 70 120 70 C92 70 72 82 64 112 Z', fill: '#2A1B12', ...S, 'stroke-width': 6 }, head);
      el('path', { d: 'M70 120 C58 170 64 220 72 260 M170 120 C182 170 176 220 168 260', stroke: '#2A1B12', 'stroke-width': 16, 'stroke-linecap': 'round', fill: 'none' }, head);
      el('circle', { cx: 72, cy: 264, r: 8, fill: '#E5484D' }, head);
      el('circle', { cx: 168, cy: 264, r: 8, fill: '#E5484D' }, head);
    } else if (kind === 'tae') {
      // элечек — белый тюрбан
      el('path', { d: 'M62 108 C56 40 184 40 178 108 C170 84 70 84 62 108 Z', fill: '#fff', ...S, 'stroke-width': 7 }, head);
      el('path', { d: 'M64 104 C60 150 72 176 86 186 L90 150 C80 140 74 124 76 104 Z M176 104 C180 150 168 176 154 186 L150 150 C160 140 166 124 164 104 Z', fill: '#fff', ...S, 'stroke-width': 6 }, head);
      el('path', { d: 'M92 98 q8 -4 16 0 M132 98 q8 -4 16 0', stroke: 'rgba(18,19,63,.35)', 'stroke-width': 3, fill: 'none' }, head);
    } else {
      // ак калпак
      el('path', { d: 'M70 74 C78 6 162 6 170 74 Z', fill: '#fff', ...S, 'stroke-width': 7 }, head);
      el('path', { d: 'M66 78 L174 78 L166 62 C140 54 100 54 74 62 Z', fill: INK }, head);
      el('path', { d: 'M100 34 q20 -12 40 0', stroke: INK, 'stroke-width': 4, fill: 'none' }, head);
      el('circle', { cx: 120, cy: 14, r: 5, fill: INK }, head);
    }
    const browL = el('path', { d: 'M92 94 q10 -6 20 0', stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round', fill: 'none' }, head);
    const browR = el('path', { d: 'M128 94 q10 -6 20 0', stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round', fill: 'none' }, head);
    const eyeL = el('ellipse', { cx: 102, cy: 110, rx: 7, ry: 10, fill: INK }, head);
    const eyeR = el('ellipse', { cx: 138, cy: 110, rx: 7, ry: 10, fill: INK }, head);
    const mouth = el('path', { d: MOUTH.neutral, stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round', fill: INK }, head);
    return { svg, g, body, legL, legR, armL, armR, stick, bowl, head, eyeL, eyeR, browL, browR, mouth };
  }

  function buildMicrobe(root, kind) {
    const svg = el('svg', { viewBox: '0 0 160 120', width: '100%', style: 'overflow:visible;display:block' }, root);
    const g = el('g', {}, svg);
    const S = { stroke: INK, 'stroke-width': 6 };
    if (kind === 'bact') {
      el('rect', { x: 14, y: 30, width: 132, height: 64, rx: 32, fill: '#FFC83D', ...S }, g);
      for (let i = 0; i < 5; i++) el('path', { d: `M${30 + i * 24} 94 q-4 14 4 22`, stroke: INK, 'stroke-width': 4, fill: 'none' }, g);
    } else {
      el('circle', { cx: 74, cy: 62, r: 42, fill: '#9FD8FF', ...S }, g);
      el('circle', { cx: 122, cy: 30, r: 16, fill: '#9FD8FF', ...S }, g);
    }
    const eyeL = el('ellipse', { cx: 62, cy: 56, rx: 6, ry: 8, fill: INK }, g);
    const eyeR = el('ellipse', { cx: 90, cy: 56, rx: 6, ry: 8, fill: INK }, g);
    const mouth = el('path', { d: 'M64 74 q12 10 24 0', stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round', fill: 'none' }, g);
    return { svg, g, eyeL, eyeR, mouth };
  }

  // ---------- состояние во времени ----------
  const chars = [...document.querySelectorAll('.char')].map((root, i) => {
    const kind = root.dataset.char;
    const move = document.createElement('div');
    move.className = 'char-move';
    root.appendChild(move);
    const human = kind === 'aibek' || kind === 'tae' || kind === 'girl';
    const parts = human ? buildHuman(move, kind) : buildMicrobe(move, kind);
    const d = root.dataset;
    const walk = (d.walk || '').split(',').filter(Boolean).map((w) => {
      const m = w.match(/^(.+?)-(s\d+.*?):(-?[\d.]+)$/);
      return { a: window.AT(m[1]), b: window.AT(m[2]), dx: parseFloat(m[3]) };
    });
    return {
      root, move, kind, human, parts, walk,
      pose: parseKeys(d.pose), expr: parseKeys(d.expr), prop: parseKeys(d.prop),
      phase: hash(kind + i) * 10, face: d.face === 'left' ? -1 : d.face === 'right' ? 1 : 0,
    };
  });

  function blinkAt(c, t) {
    // моргание каждые ~0.5–2.3 c на 4 кадра
    let s = c.phase, k = 0;
    while (s < t && k < 400) { if (t - s < 0.13) return true; s += 0.5 + 1.8 * hash(c.kind + k++); }
    return false;
  }

  function update(t) {
    for (const c of chars) {
      if (c.root.closest('.scene')?.style.display === 'none') continue;
      const P = c.parts;
      // --- ходьба ---
      let dx = 0, walking = false;
      for (const w of c.walk) {
        if (t < w.a) dx += w.dx; // ещё не пришёл
        else if (t < w.b) { dx += w.dx * (1 - smooth((t - w.a) / (w.b - w.a))); walking = true; }
      }
      const stepPh = (t - c.phase) * 2 * Math.PI * 2.2;
      const bob = walking ? Math.abs(Math.sin(stepPh)) * -10 : Math.sin(t * 2.2 + c.phase) * 3;
      c.move.style.transform = `translate(${dx}px, ${bob}px)`;

      if (!c.human) {
        // микроб: покачивание и «жевание»
        const ex = valueAt(c.expr, t, 'happy').v;
        P.g.setAttribute('transform', `rotate(${Math.sin(t * 3 + c.phase) * 8} 80 60) translate(0 ${Math.sin(t * 4 + c.phase) * 4})`);
        const chomp = ex === 'chomp' ? 0.5 + 0.5 * Math.sin(t * 18 + c.phase) : 0;
        P.mouth.setAttribute('d', ex === 'sour' ? 'M62 76 q6 -6 12 0 q6 6 12 0 q6 -6 12 0' : chomp ? `M66 72 h20 q-10 ${6 + chomp * 14} -20 0` : 'M64 74 q12 10 24 0');
        const bl = blinkAt(c, t);
        P.eyeL.setAttribute('ry', bl ? 1 : 8); P.eyeR.setAttribute('ry', bl ? 1 : 8);
        continue;
      }

      // --- позы рук ---
      const cur = valueAt(c.pose, t, 'idle'), prev = prevValue(c.pose, t, 'idle');
      const k = smooth((t - cur.since) / 0.22);
      const A = POSES[cur.v] || POSES.idle, B = POSES[prev] || POSES.idle;
      let aL = B.L + (A.L - B.L) * k, aR = B.R + (A.R - B.R) * k;
      let bodyY = 0, headRot = Math.sin(t * 1.7 + c.phase) * 2;
      if (cur.v === 'churn') {
        // всё быстрее: частота растёт со временем позы
        const u = t - cur.since;
        const ph = 2 * Math.PI * (1.4 * u + 0.45 * u * u);
        aL += Math.sin(ph) * 14; aR -= Math.sin(ph) * 14; bodyY = Math.sin(ph) * 6;
      }
      if (cur.v === 'wave') aR += Math.sin(t * 12) * 18;
      if (cur.v === 'drink') headRot = -10 * k;
      P.armL.setAttribute('transform', `rotate(${aL} 98 196)`);
      P.armR.setAttribute('transform', `rotate(${aR} 142 196)`);
      P.body.setAttribute('transform', `translate(0 ${bodyY})`);
      // шаги
      const sw = walking ? Math.sin(stepPh) * 22 : 0;
      P.legL.setAttribute('transform', `rotate(${sw} 108 300)`);
      P.legR.setAttribute('transform', `rotate(${-sw} 132 300)`);
      P.head.setAttribute('transform', `rotate(${headRot} 120 170) translate(0 ${bodyY * 0.6})`);
      // предмет
      const pr = valueAt(c.prop, t, 'none').v;
      P.stick.setAttribute('visibility', pr === 'stick' ? 'visible' : 'hidden');
      P.bowl.setAttribute('visibility', pr === 'bowl' ? 'visible' : 'hidden');

      // --- лицо ---
      const ex = valueAt(c.expr, t, 'smile').v;
      const bl = blinkAt(c, t);
      const look = c.face * 5;
      let ry = 10, rx = 7, ryR = null;
      if (ex === 'shock') { rx = 9; ry = 13; }
      if (ex === 'sus' || ex === 'effort' || ex === 'tired') ry = 4;
      if (ex === 'happy') ry = 9;
      if (ex === 'wink') ryR = 1.5;
      if (bl) ry = 1.2;
      P.eyeL.setAttribute('rx', rx); P.eyeR.setAttribute('rx', rx);
      P.eyeL.setAttribute('ry', ry); P.eyeR.setAttribute('ry', ryR ?? ry);
      P.eyeL.setAttribute('cx', 102 + look); P.eyeR.setAttribute('cx', 138 + look);
      const brow = { shock: -10, sus: 4, sour: 6, effort: 6, tired: 2 }[ex] || 0;
      P.browL.setAttribute('transform', `translate(0 ${brow}) rotate(${ex === 'sus' ? 8 : ex === 'sour' ? 12 : 0} 102 94)`);
      P.browR.setAttribute('transform', `translate(0 ${ex === 'sus' ? -6 : brow}) rotate(${ex === 'sour' ? -12 : 0} 138 94)`);
      P.mouth.setAttribute('d', MOUTH[ex] || MOUTH.smile);
      P.mouth.setAttribute('fill', ['happy', 'shock', 'wink', 'effort'].includes(ex) ? INK : 'none');
    }
  }

  const prev = window.CHAR_UPDATE;
  window.CHAR_UPDATE = (t) => { if (prev) prev(t); update(t); };
})();
