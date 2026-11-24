/* KAINAP motion engine.
 * Всё, что видно в кадре, — чистая функция от времени t: window.renderAt(t).
 * Поэтому рендер покадровый, без пропусков и одинаковый при каждом запуске.
 *
 * Время в атрибутах привязано к озвучке (window.TIMINGS из build/timings.json):
 *   "s3"        — начало сегмента s3
 *   "s3$"       — конец сегмента s3
 *   "s3@0.5"    — середина сегмента s3 (доля 0..1)
 *   "s3#4"      — начало 5-го слова сегмента s3 (счёт с 0)
 *   "s3#4+0.2"  — плюс/минус смещение в секундах (работает с любой формой)
 *
 * Атрибуты элементов:
 *   data-in="время"     появление;  data-anim="pop|up|down|left|right|fade|grow|fly|draw"
 *   data-out="время"    исчезновение (fade + уменьшение)
 *   data-hl="время"     с этого момента класс .hl (data-hl-off — снять)
 *   data-dim="время"    с этого момента класс .dim
 *   data-shake="время"  короткая тряска
 *   data-float          лёгкое покачивание;  data-flicker — пламя;  data-smoke — дым по кругу
 *   data-fly="dx,dy"    откуда прилетает для anim=fly
 *   data-silent         не добавлять «поп» в звуковые эффекты
 * Сцена: <section class="scene" data-from="s5">, видна до начала следующей сцены.
 */
(function () {
  const T = window.TIMINGS;
  if (!T) throw new Error('TIMINGS не загружены');
  const seg = {};
  T.segments.forEach((s) => (seg[s.id] = s));

  function at(spec) {
    if (spec == null || spec === '') return null;
    const m = String(spec).trim().match(/^([a-z0-9_]+)(\$)?(?:#(\d+))?(?:@([\d.]+))?([+-][\d.]+)?$/i);
    if (!m) throw new Error('Неверное время: ' + spec);
    const s = seg[m[1]];
    if (!s) throw new Error('Нет сегмента: ' + m[1]);
    let t = s.start;
    if (m[2]) t = s.end;
    if (m[3] != null) t = s.words[Math.min(+m[3], s.words.length - 1)].start;
    if (m[4] != null) t = s.start + parseFloat(m[4]) * (s.end - s.start);
    if (m[5]) t += parseFloat(m[5]);
    return t;
  }

  window.AT = at;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const outCubic = (x) => 1 - Math.pow(1 - x, 3);
  const outBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const hash = (str) => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0) / 4294967295; };

  const SMOOTH = 'smooth' in document.body.dataset;
  const IN_DUR = SMOOTH ? 0.65 : 0.42, OUT_DUR = SMOOTH ? 0.5 : 0.3, SCENE_OUT = 0.28;
  const easeIO = (x) => x * x * x * (x * (x * 6 - 15) + 10); // smootherstep

  // ---- сцены и элементы ----
  const scenes = [...document.querySelectorAll('.scene')].map((el) => ({ el, t0: at(el.dataset.from) }));
  scenes.sort((a, b) => a.t0 - b.t0);
  scenes.forEach((s, i) => (s.t1 = i + 1 < scenes.length ? scenes[i + 1].t0 : T.total + 10));

  const items = [];
  scenes.forEach((s) => {
    s.el.querySelectorAll('*').forEach((el, idx) => {
      const d = el.dataset;
      const keys = ['in', 'out', 'hl', 'dim', 'shake', 'float', 'flicker', 'smoke', 'scale', 'zoom', 'punch', 'spin', 'orbit', 'move', 'cam', 'beat', 'rot', 'sweep'];
      if (!keys.some((k) => k in d)) return;
      const it = {
        el, d,
        tin: 'in' in d ? at(d.in) : null,
        tout: at(d.out),
        thl: at(d.hl), thlOff: at(d.hlOff),
        tdim: at(d.dim),
        tshake: at(d.shake),
        anim: d.anim || 'pop',
        phase: hash(idx + (el.className || '') + s.t0) * 6.28,
        scene: s,
        scaleKeys: d.scale ? d.scale.split(',').map((kv) => { const i = kv.lastIndexOf(':'); return [at(kv.slice(0, i)), parseFloat(kv.slice(i + 1))]; }).sort((a, b) => a[0] - b[0]) : null,
        zoom: d.zoom ? d.zoom.split(',').map(Number) : null,
        punches: d.punch ? d.punch.split(',').map(at) : [],
        camKeys: d.cam ? d.cam.split(';').map((kv) => { const i = kv.lastIndexOf(':'); const [z, x, y, du] = kv.slice(i + 1).split(',').map(Number); return [at(kv.slice(0, i)), z, x, y, du]; }).sort((a, b) => a[0] - b[0]) : null,
        rotKeys: d.rot ? d.rot.split(';').map((kv) => { const i = kv.lastIndexOf(':'); const [a, du] = kv.slice(i + 1).split(',').map(Number); return [at(kv.slice(0, i)), a, du]; }).sort((a, b) => a[0] - b[0]) : null,
        moveKeys: d.move ? d.move.split(';').map((kv) => { const i = kv.lastIndexOf(':'); const [x, y, d] = kv.slice(i + 1).split(',').map(Number); return [at(kv.slice(0, i)), x, y, d]; }).sort((a, b) => a[0] - b[0]) : null,
      };
      if (it.anim === 'draw') {
        const len = el.getTotalLength ? el.getTotalLength() : 1000;
        it.len = len; el.style.strokeDasharray = len;
      }
      if (it.anim === 'fly') it.fly = (d.fly || '0,-300').split(',').map(Number);
      items.push(it);
    });
  });

  // ---- субтитры: группы по 2–4 слова, равномерно внутри предложения ----
  const chunks = [];
  T.segments.forEach((s) => {
    const sentences = [[]];
    s.words.forEach((w, i) => {
      sentences[sentences.length - 1].push(w);
      if (/[.?!:]$/.test(w.w) && i < s.words.length - 1) sentences.push([]);
    });
    sentences.forEach((ws) => {
      const lens = ws.map((w) => w.w.length + 1);
      const chars = lens.reduce((a, b) => a + b, 0);
      const n = Math.max(Math.ceil(chars / 24), Math.ceil(ws.length / 4));
      const target = chars / n;
      let acc = 0, idx = -1;
      ws.forEach((w, i) => {
        const k = Math.min(n - 1, Math.floor((acc + lens[i] / 2) / target));
        if (k !== idx) { chunks.push({ start: w.start, words: [] }); idx = k; }
        chunks[chunks.length - 1].words.push(w);
        acc += lens[i];
      });
    });
  });
  chunks.forEach((c, i) => (c.end = i + 1 < chunks.length ? chunks[i + 1].start : T.total));

  const cap = document.querySelector('.cap');
  const PLAIN = document.body.classList.contains('cap-plain');
  if (PLAIN) {
    // кинематографичный режим: одна фраза целиком (до ~2 строк), без подсветки по словам
    chunks.length = 0;
    T.segments.forEach((s) => {
      let cur = null;
      s.words.forEach((w, i) => {
        if (!cur || cur.words.map((x) => x.w).join(' ').length > 34) { cur = { start: w.start, words: [] }; chunks.push(cur); }
        cur.words.push(w);
        if (/[.?!:,—]$/.test(w.w.replace(/[*~^]/g, '')) && cur.words.map((x) => x.w).join(' ').length > 14 && i < s.words.length - 1) cur = null;
      });
    });
    chunks.forEach((c, i) => (c.end = i + 1 < chunks.length ? chunks[i + 1].start : c.words[c.words.length - 1].end + 0.6));
  }
  let capShown = null;
  function renderCaption(t) {
    const c = chunks.find((c) => t >= c.start && t < c.end);
    if (!c) { cap.style.opacity = 0; capShown = null; return; }
    if (capShown !== c) {
      cap.innerHTML = '<div class="cap-box">' + c.words.map((w) =>
        '<span class="w' + (w.w.includes('*') ? ' key' : '') + (w.w.includes('~') ? ' blue' : '') + (w.w.includes('^') ? ' red' : '') + '">' + w.w.replace(/[*~^]/g, '') + '</span>').join(' ') + '</div>';
      capShown = c;
    }
    if (PLAIN) {
      const p = clamp((t - c.start) / (SMOOTH ? 0.22 : 0.3));
      cap.style.opacity = outCubic(p);
      cap.style.transform = `translateY(${(1 - outCubic(p)) * 14}px)`;
      return;
    }
    const spans = cap.querySelectorAll('.w');
    c.words.forEach((w, i) => {
      const on = t >= w.start && (i + 1 < c.words.length ? t < c.words[i + 1].start : t < w.end + 0.25);
      spans[i].className = 'w ' + (on ? 'on' : t >= w.start ? 'past' : 'future');
    });
    const p = clamp((t - c.start) / 0.22);
    cap.style.opacity = 1;
    cap.style.transform = `scale(${0.9 + 0.1 * outBack(p)})`;
  }

  // ---- фон ----
  const blobs = [...document.querySelectorAll('.blob')];
  const sparks = [...document.querySelectorAll('.spark')];
  const mascot = document.querySelector('.mascot');
  const bubbles = mascot ? [...mascot.querySelectorAll('.bub')] : [];

  function renderBackground(t) {
    blobs.forEach((b, i) => {
      const k = i + 1;
      b.style.transform = `translate(${Math.sin(t * 0.25 * k + k) * 28}px, ${Math.cos(t * 0.2 * k + k * 2) * 24}px) scale(${1 + Math.sin(t * 0.3 + k) * 0.025})`;
    });
    sparks.forEach((s, i) => {
      const v = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7);
      s.style.transform = `scale(${0.6 + 0.5 * v}) rotate(${Math.sin(t + i) * 20}deg)`;
      s.style.opacity = 0.45 + 0.55 * v;
    });
    if (mascot) {
      mascot.style.transform = `translateY(${Math.sin(t * 2.1) * 8}px) rotate(${Math.sin(t * 1.3) * 5}deg)`;
      bubbles.forEach((b, i) => {
        const ph = (t * 0.7 + i / bubbles.length) % 1;
        b.style.transform = `translate(${Math.sin(ph * 9 + i) * 10}px, ${-ph * 120}px) scale(${0.5 + ph})`;
        b.style.opacity = ph < 0.1 ? ph * 10 : 1 - ph;
      });
    }
  }

  // ---- элементы ----
  function renderItem(it, t) {
    const { el } = it;
    let op = 1, tf = '';
    if (it.tin != null) {
      const p = clamp((t - it.tin) / IN_DUR);
      const e = outCubic(p), b = outBack(p);
      switch (it.anim) {
        case 'pop': if (SMOOTH) { tf += `scale(${0.86 + 0.14 * easeIO(p)})`; op = easeIO(clamp(p * 1.4)); } else { tf += `scale(${Math.max(0, 0.3 + 0.7 * b)})`; op = clamp(p * 4); } break;
        case 'up': tf += `translateY(${(1 - (SMOOTH ? easeIO(p) : e)) * (SMOOTH ? 40 : 70)}px)`; op = SMOOTH ? easeIO(p) : clamp(p * 2.5); break;
        case 'down': tf += `translateY(${-(1 - e) * 70}px)`; op = clamp(p * 2.5); break;
        case 'left': tf += `translateX(${-(1 - e) * 120}px)`; op = clamp(p * 2.5); break;
        case 'right': tf += `translateX(${(1 - e) * 120}px)`; op = clamp(p * 2.5); break;
        case 'grow': tf += `scaleX(${e})`; op = clamp(p * 4); break;
        case 'fade': op = e; break;
        case 'fly': tf += `translate(${(1 - e) * it.fly[0]}px, ${(1 - e) * it.fly[1]}px) scale(${0.6 + 0.4 * b})`; op = clamp(p * 3); break;
        case 'draw': el.style.strokeDashoffset = it.len * (1 - e); op = p > 0 ? 1 : 0; break;
      }
    }
    if (it.tout != null) {
      const q = clamp((t - it.tout) / OUT_DUR);
      op *= 1 - (SMOOTH ? easeIO(q) : q);
      tf += SMOOTH ? ` translateY(${-20 * easeIO(q)}px)` : ` scale(${1 - 0.35 * outCubic(q)})`;
    }
    if (it.tshake != null && t >= it.tshake && t < it.tshake + 0.6) {
      const k = 1 - (t - it.tshake) / 0.6;
      tf += ` translateX(${Math.sin((t - it.tshake) * 55) * 14 * k}px) rotate(${Math.sin((t - it.tshake) * 40) * 3 * k}deg)`;
    }
    if ('float' in it.d) tf += ` translateY(${Math.sin(t * 2 + it.phase) * 9}px)`;
    if ('flicker' in it.d) tf += ` scaleY(${1 + 0.1 * Math.sin(t * 13 + it.phase) + 0.06 * Math.sin(t * 7.3)}) scaleX(${1 + 0.05 * Math.sin(t * 11 + it.phase)})`;
    if ('smoke' in it.d) {
      const ph = (t * 0.45 + it.phase / 6.28) % 1;
      tf += ` translate(${Math.sin(ph * 6) * 14}px, ${-ph * 110}px) scale(${0.5 + ph * 1.1})`;
      op *= ph < 0.15 ? ph / 0.15 : (1 - ph);
    }
    if (it.camKeys) {
      // камера: плавный наезд/панорама на точку (cx,cy) с зумом z; между ключами — лёгкий дрейф
      let [, z, cx, cy] = it.camKeys[0];
      for (let i = 1; i < it.camKeys.length; i++) {
        const [kt, kz, kx, ky, kd] = it.camKeys[i];
        const u = clamp((t - kt) / (kd || 1.8)); const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
        z += (kz - z) * e; cx += (kx - cx) * e; cy += (ky - cy) * e;
      }
      z *= 1 + 0.008 * (t - it.scene.t0);
      const W = 1920, H = 1080;
      z = Math.max(1, z);
      cx = Math.min(W - W / 2 / z, Math.max(W / 2 / z, cx));   // камера не выходит за края мира
      cy = Math.min(H - H / 2 / z, Math.max(H / 2 / z, cy));
      el.style.transformOrigin = '0 0';
      tf = `translate(${W / 2 - cx * z}px, ${H / 2 - cy * z}px) scale(${z}) ` + tf;
    }
    if (it.moveKeys) {
      // плавное перемещение между ключами (по 0.6 c на переход, ease in-out)
      let x = it.moveKeys[0][1], y = it.moveKeys[0][2];
      for (let i = 1; i < it.moveKeys.length; i++) {
        const [kt, kx, ky, kd] = it.moveKeys[i];
        const dur = kd || Math.max(0.3, Math.min(1.2, kt - it.moveKeys[i - 1][0]));
        const u = clamp((t - kt) / dur); const e = SMOOTH ? easeIO(u) : u * u * (3 - 2 * u);
        x += (kx - x) * e; y += (ky - y) * e;
      }
      tf = `translate(${x}px, ${y}px) ` + tf;
    }
    if (it.rotKeys) {
      let a = it.rotKeys[0][1];
      for (let i = 1; i < it.rotKeys.length; i++) {
        const [kt, ka, kd] = it.rotKeys[i];
        const u = clamp((t - kt) / (kd || 0.6)); a += (ka - a) * outBack(u);
      }
      tf += ` rotate(${a}deg)`;
    }
    if (it.scaleKeys) {
      // масштаб по ключам "время:значение" с плавными переходами 0.35 c
      let v = it.scaleKeys[0][1];
      for (let i = 1; i < it.scaleKeys.length; i++) {
        const [kt, kv] = it.scaleKeys[i];
        if (t >= kt) v = v + (kv - v) * (SMOOTH ? easeIO(clamp((t - kt) / 0.7)) : outBack(clamp((t - kt) / 0.35)));
      }
      tf += ` scale(${v})`;
    }
    if (it.zoom) {
      // «камера»: медленный наезд за всё время сцены + толчки на ключевых словах
      const u = clamp((t - it.scene.t0) / Math.max(0.1, it.scene.t1 - it.scene.t0));
      let z = it.zoom[0] + (it.zoom[1] - it.zoom[0]) * u;
      for (const pt of it.punches) if (t >= pt) z += 0.07 * Math.exp(-(t - pt) * 7) * Math.min(1, (t - pt) * 30);
      tf += ` scale(${z})`;
    } else if (it.punches.length) {
      let z = 1;
      for (const pt of it.punches) if (t >= pt) z += 0.12 * Math.exp(-(t - pt) * 7) * Math.min(1, (t - pt) * 30);
      tf += ` scale(${z})`;
    }
    if ('orbit' in it.d) {
      // движение по эллипсу: data-orbit="rx,ry,оборотов_в_сек,фаза"
      const [rx, ry, sp, ph] = it.d.orbit.split(',').map(Number);
      const a = 2 * Math.PI * (t * sp + (ph || 0));
      tf = `translate(${Math.cos(a) * rx}px, ${Math.sin(a) * ry}px) ` + tf;
    }
    if ('beat' in it.d) {
      const per = 60 / (parseFloat(it.d.beat) || 70);
      const ph = ((t % per) + per) % per;
      const bump = (x, c, w) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
      tf += ` scale(${1 + 0.16 * bump(ph, 0.08, 0.045) + 0.09 * bump(ph, 0.3, 0.05)})`;
    }
    if ('spin' in it.d) tf += ` rotate(${t * parseFloat(it.d.spin || 20)}deg)`;
    if ('sweep' in it.d) {
      // маркер «прорисовывается» слева направо под текстом
      const t0 = at(it.d.sweep), u = clamp((t - t0) / (parseFloat(it.d.sweepDur) || 0.7));
      el.style.backgroundSize = `${(SMOOTH ? easeIO(u) : u) * 100}% 100%`;
    }
    if (it.thl != null) el.classList.toggle('hl', t >= it.thl && (it.thlOff == null || t < it.thlOff));
    if (it.tdim != null) el.classList.toggle('dim', t >= it.tdim);
    el.style.opacity = op;
    el.style.transform = tf;
  }

  const XF = parseFloat(document.body.dataset.xfade || '0');
  window.renderAt = function (t) {
    renderBackground(t);
    if (XF > 0) {
      // растворение: следующая сцена проявляется поверх предыдущей, без провала в чёрное
      scenes.forEach((s, i) => {
        const a = i === 0 ? -1 : s.t0 - XF;
        const visible = t >= a && t < s.t1;
        s.el.style.display = visible ? 'block' : 'none';
        if (!visible) return;
        const u = i === 0 ? 1 : clamp((t - a) / XF);
        s.el.style.opacity = u * u * (3 - 2 * u);
        s.el.style.transform = '';
      });
    } else
    scenes.forEach((s, i) => {
      const visible = t >= s.t0 - 0.01 && t < s.t1;
      s.el.style.display = visible ? 'flex' : 'none';
      if (!visible) return;
      const last = i === scenes.length - 1;
      const q = last ? 0 : clamp((t - (s.t1 - SCENE_OUT)) / SCENE_OUT);
      s.el.style.opacity = 1 - q;
      s.el.style.transform = `translateY(${-40 * outCubic(q)}px) scale(${1 - 0.04 * q})`;
    });
    items.forEach((it) => {
      const sc = it.el.closest('.scene');
      if (sc.style.display !== 'none') renderItem(it, t);
    });
    if (window.CHAR_UPDATE) window.CHAR_UPDATE(t);
    renderCaption(t);
  };

  // моменты появления элементов — для звуковых «попов» и «вжухов»
  window.collectEvents = function () {
    const sfx = [...document.querySelectorAll('[data-sfx]')].map((e) => ({ t: +at(e.dataset.sfxAt || e.dataset.in).toFixed(3), name: e.dataset.sfx }));
    if (document.body.dataset.pops === 'off') return { pops: [], whooshes: [], sfx, total: T.total };
    const pops = items.filter((it) => it.tin != null && !('silent' in it.d) && !it.el.closest('[data-silent]')).map((it) => +it.tin.toFixed(3));
    const whooshes = scenes.slice(1).map((s) => +(s.t0 - 0.12).toFixed(3));
    return { pops: [...new Set(pops)].sort((a, b) => a - b), whooshes, sfx, total: T.total };
  };

  window.ENGINE_READY = true;

  // Предпросмотр в браузере: scene.html?play (клик — старт со звуком), ?t=12.5 — стоп-кадр
  const q = new URLSearchParams(location.search);
  if (q.has('t')) window.renderAt(parseFloat(q.get('t')));
  else if (q.has('play')) {
    const audio = new Audio('build/voice.wav');
    window.renderAt(0);
    document.body.addEventListener('click', () => {
      audio.currentTime = 0; audio.play();
      const loop = () => { window.renderAt(audio.currentTime); if (!audio.ended) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
  }
})();
