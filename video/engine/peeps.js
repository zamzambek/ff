/* Персонажи Open Peeps (по пояс) с мимикой. Нужен assets/peeps/cast.js (window.PEEPS).
 *
 * <div class="peep" data-peep="agai|aibek|aiperi" style="left;top;width"
 *      data-expr="s1:Smile,s2#3:Fear"   — эмоция по времени (имена лиц Open Peeps:
 *                                          Smile BigSmile Awe Fear Suspicious Rage Cheeky SmileLOL
 *                                          Hectic Concerned Explaining EyesClosed Calm Cute Driven ...)
 *      data-talk="s6~s8$"               — интервалы речи (через ~, несколько — через запятую): рот открывается на каждом слове
 *      data-face="left">                — отразить (смотрит влево)
 * Моргание, дыхание, лёгкие наклоны головы и кивок при смене эмоции — автоматически.
 */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const P = window.PEEPS;
  if (!P) return;
  const T = window.TIMINGS;
  const words = T.segments.flatMap((s) => s.words);
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0) / 4294967295; };
  // «открытый рот» для речи — пара к каждой эмоции
  const TALK = { Smile: 'Explaining', Calm: 'Explaining', Cute: 'Explaining', Cheeky: 'SmileLOL', BigSmile: 'SmileLOL',
    Suspicious: 'Explaining', Serious: 'Explaining', Concerned: 'ConcernedFear', Fear: 'Hectic', Awe: 'Hectic',
    Driven: 'Explaining', Solemn: 'Explaining', Tired: 'Explaining', Explaining: 'Smile' };

  const keys = (s) => (s || '').split(',').filter(Boolean).map((kv) => {
    const i = kv.lastIndexOf(':'); return { t: window.AT(kv.slice(0, i).trim()), v: kv.slice(i + 1).trim() };
  }).sort((a, b) => a.t - b.t);

  const peeps = [...document.querySelectorAll('.peep')].map((root, idx) => {
    const c = P.cast[root.dataset.peep];
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '184 160 940 1180');
    svg.setAttribute('width', '100%');
    svg.style.overflow = 'visible'; svg.style.display = 'block';
    const used = new Set(['EyesClosed', 'Explaining', 'Smile']);
    const ex = keys(root.dataset.expr);
    ex.forEach((k) => { used.add(k.v); if (TALK[k.v]) used.add(TALK[k.v]); });
    let faces = '';
    for (const f of used) if (P.faces[f]) faces += `<g data-f="${f}" style="display:none">${P.faces[f]}</g>`;
    svg.innerHTML = `<g class="pb"><g transform="translate(147,639)">${c.body}</g>
      <g class="ph"><g transform="translate(342,190)">${c.hair}</g><g transform="translate(531,366)">${faces}</g>
      ${c.acc ? `<g transform="translate(419,421)">${c.acc}</g>` : ''}</g></g>`;
    const wrap = document.createElement('div');
    wrap.style.transformOrigin = '50% 100%';
    if (root.dataset.face === 'left') wrap.style.transform = 'scaleX(-1)';
    wrap.appendChild(svg); root.appendChild(wrap);
    const talk = (root.dataset.talk || '').split(',').filter(Boolean).map((r) => {
      const m = r.split('~'); return [window.AT(m[0]), window.AT(m[1])];
    });
    return { root, svg, body: svg.querySelector('.pb'), head: svg.querySelector('.ph'),
      faceEls: Object.fromEntries([...svg.querySelectorAll('[data-f]')].map((g) => [g.dataset.f, g])),
      ex, talk, ph: hash(root.dataset.peep + idx) * 10, shown: null };
  });

  function blinking(p, t) {
    let s = p.ph % 2.5, k = 0;
    while (s < t && k < 500) { if (t - s < 0.12) return true; s += 2.2 + 2.4 * hash(p.root.dataset.peep + k++); }
    return false;
  }

  function update(t) {
    for (const p of peeps) {
      if (p.root.closest('.scene')?.style.display === 'none') continue;
      let cur = p.ex.length ? p.ex[0].v : 'Smile', since = -1e9;
      for (const k of p.ex) if (t >= k.t) { cur = k.v; since = k.t; }
      let face = cur;
      // речь: рот открыт в первой половине каждого слова
      const talking = p.talk.some(([a, b]) => t >= a && t < b);
      if (talking && TALK[cur]) {
        const w = words.find((w) => t >= w.start && t < w.end);
        if (w && (t - w.start) < (w.end - w.start) * 0.55) face = TALK[cur];
      } else if (blinking(p, t) && !['EyesClosed', 'SmileLOL', 'BigSmile'].includes(cur)) face = 'EyesClosed';
      if (p.shown !== face) {
        for (const [n, g] of Object.entries(p.faceEls)) g.style.display = n === face ? 'inline' : 'none';
        p.shown = face;
      }
      // голова: покачивание + кивок при смене эмоции; тело: дыхание
      const nod = since > -1e8 ? Math.exp(-(t - since) * 6) * Math.sin((t - since) * 18) * 5 : 0;
      const sway = Math.sin(t * 1.3 + p.ph) * 2.2 + (talking ? Math.sin(t * 7 + p.ph) * 1.6 : 0);
      p.head.setAttribute('transform', `rotate(${sway + nod} 640 760)`);
      const br = 1 + Math.sin(t * 2.1 + p.ph) * 0.008;
      p.body.setAttribute('transform', `translate(0 ${(1 - br) * 900}) scale(1 ${br})`);
    }
  }

  const prev = window.CHAR_UPDATE;
  window.CHAR_UPDATE = (t) => { if (prev) prev(t); update(t); };
})();
