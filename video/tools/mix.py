#!/usr/bin/env python3
"""Сведение звука: голос + синтезированные «попы» (появление элементов) и «вжухи» (смена сцены).
Необязательно: фоновая музыка  --music path/to/track.(mp3|wav)  (тихо, под голос).
Результат: build/final.wav, затем ffmpeg склеивает с build/silent.mp4 → build/<имя>.mp4
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100


def read_wav(p):
    with wave.open(str(p)) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        return a


def pop():
    n = int(SR * 0.07)
    t = np.arange(n) / SR
    freq = 950 - 5000 * t  # быстрый спад высоты — мягкий «поп»
    ph = 2 * np.pi * np.cumsum(freq) / SR
    return np.sin(ph) * np.exp(-t * 55) * 0.13


def whoosh(rng):
    n = int(SR * 0.32)
    noise = rng.standard_normal(n).astype(np.float32)
    # простой фильтр нижних частот + огибающая «нарастание-спад»
    k = 18
    noise = np.convolve(noise, np.ones(k) / k, mode="same")
    env = np.sin(np.linspace(0, np.pi, n)) ** 2
    return noise * env * 0.09


def beat_bed(n, bpm=118, rng=None):
    """Лёгкий синтезированный ритм (без чужой музыки): бочка, хэт и басовая партия."""
    out = np.zeros(n, dtype=np.float32)
    beat = 60 / bpm
    kl = int(SR * 0.22)
    tk = np.arange(kl) / SR
    kick = np.sin(2 * np.pi * np.cumsum(50 + 90 * np.exp(-tk * 30)) / SR) * np.exp(-tk * 14) * 0.55
    hl = int(SR * 0.05)
    hat = rng.standard_normal(hl).astype(np.float32)
    hat = (hat - np.convolve(hat, np.ones(6) / 6, "same")) * np.exp(-np.arange(hl) / SR * 90) * 0.12
    bass_notes = [55.0, 55.0, 65.41, 73.42]  # A1 A1 C2 D2 — по такту
    bl = int(SR * beat * 0.9)
    tb = np.arange(bl) / SR
    i, t = 0, 0.0
    while t < n / SR:
        add(out, kick, t)
        add(out, hat, t + beat / 2)
        f = bass_notes[(i // 4) % 4]
        if i % 2 == 0:
            add(out, (np.sin(2 * np.pi * f * tb) + 0.3 * np.sin(4 * np.pi * f * tb)) * np.exp(-tb * 5) * 0.22, t)
        i += 1
        t += beat
    return out


def ambient_pad(n, rng):
    """Тихая атмосферная подложка: медленные аккорды Am–F–C–G (синтез, без чужой музыки)."""
    out = np.zeros(n, dtype=np.float32)
    chords = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [130.81, 196.0, 261.63], [196.0, 246.94, 293.66]]
    bar = 4.0
    L = int(SR * (bar + 1.5))
    tt = np.arange(L) / SR
    env = np.minimum(1, tt / 1.2) * np.minimum(1, (L / SR - tt) / 1.5)
    i, t = 0, 0.0
    while t < n / SR:
        sig = np.zeros(L, dtype=np.float32)
        for f in chords[i % 4]:
            for det in (-0.6, 0.6):
                sig += np.sin(2 * np.pi * (f + det) * tt) * 0.05 + np.sin(2 * np.pi * (f / 2) * tt) * 0.02
        add(out, sig * env, t)
        i += 1
        t += bar
    return out


def rain_bed(n, rng):
    x = rng.standard_normal(n).astype(np.float32)
    x = np.convolve(x, np.ones(4) / 4, "same") - np.convolve(x, np.ones(60) / 60, "same")
    return x * 0.017  # дождь тихо, на фоне


def sfx_clip(name, rng):
    if name == "whistle":
        L = int(SR * 1.8); tt = np.arange(L) / SR
        f = 1900 + 500 * np.minimum(1, tt / 0.8) + 25 * np.sin(2 * np.pi * 6 * tt)
        env = np.minimum(1, tt / 0.5) * np.minimum(1, (1.8 - tt) / 0.5)
        breath = rng.standard_normal(L).astype(np.float32) * 0.05
        return (np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.11 + breath * 0.3) * env
    if name == "ufo":
        L = int(SR * 3.2); tt = np.arange(L) / SR
        f = 220 + 60 * np.sin(2 * np.pi * 3.5 * tt) + 40 * tt
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.6 + np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR) * 0.25
        env = np.minimum(1, tt / 0.6) * np.minimum(1, (3.2 - tt) / 0.8)
        return (x * env * 0.08).astype(np.float32)
    if name == "ding":
        L = int(SR * 1.4); tt = np.arange(L) / SR
        x = sum(np.sin(2 * np.pi * fr * tt) * np.exp(-tt * d) * a for fr, d, a in ((1568, 3.2, .5), (2349, 4.5, .25), (3136, 6, .12)))
        return (x * np.minimum(1, tt / 0.003) * 0.16).astype(np.float32)
    if name == "tickroll":
        L = int(SR * 1.3); out = np.zeros(L, dtype=np.float32); t0 = 0.0; k = 0
        while t0 < 1.2:
            i = int(t0 * SR); n2 = int(SR * 0.012); tt = np.arange(n2) / SR
            out[i:i + n2] += (np.sin(2 * np.pi * (2200 + 40 * k) * tt) * np.exp(-tt * 400) * 0.09)[: L - i]
            t0 += 0.05 + 0.1 * (t0 / 1.2) ** 2; k += 1
        return out
    if name == "buzz":
        L = int(SR * 0.9); tt = np.arange(L) / SR
        x = np.sign(np.sin(2 * np.pi * 70 * tt)) * 0.5 + np.sin(2 * np.pi * 140 * tt) * 0.3
        x = np.convolve(x, np.ones(30) / 30, "same") * (1 + 0.5 * np.sin(2 * np.pi * 18 * tt))
        return (x * np.minimum(1, tt / 0.05) * np.minimum(1, (0.9 - tt) / 0.25) * 0.09).astype(np.float32)
    if name == "swoosh":
        L = int(SR * 0.55); x = rng.standard_normal(L).astype(np.float32); tt = np.arange(L) / SR
        lo = np.convolve(x, np.ones(40) / 40, "same"); hi = np.convolve(x, np.ones(6) / 6, "same")
        m = (tt / 0.55)
        return ((lo * (1 - m) + hi * m) * np.sin(np.pi * m) ** 2 * 0.22).astype(np.float32)
    if name == "softpop":
        L = int(SR * 0.09); tt = np.arange(L) / SR
        return (np.sin(2 * np.pi * np.cumsum(700 - 3000 * tt) / SR) * np.exp(-tt * 60) * 0.07).astype(np.float32)
    if name == "riser":
        L = int(SR * 1.25); tt = np.arange(L) / SR
        x = rng.standard_normal(L).astype(np.float32)
        k = np.convolve(x, np.ones(8) / 8, "same")
        tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * (tt / 1.25) ** 2) / SR)
        return (k * 0.25 + tone * 0.08) * (tt / 1.25) ** 2
    if name == "heartbeat":
        L = int(SR * 0.9); tt = np.arange(L) / SR; out = np.zeros(L, dtype=np.float32)
        for st, a in ((0.0, 0.55), (0.24, 0.4)):
            k = tt[tt >= st] - st
            out[tt >= st] += np.sin(2 * np.pi * 52 * k) * np.exp(-k * 18) * a
        return out
    if name == "tick":
        L = int(SR * 0.03); tt = np.arange(L) / SR
        return np.sin(2 * np.pi * 2500 * tt) * np.exp(-tt * 300) * 0.15
    if name == "boom":
        L = int(SR * 1.5); tt = np.arange(L) / SR
        return np.sin(2 * np.pi * np.cumsum(40 + 60 * np.exp(-tt * 6)) / SR) * np.exp(-tt * 2.5) * 0.5
    if name == "flame":
        L = int(SR * 1.2); x = rng.standard_normal(L).astype(np.float32)
        x = np.convolve(x, np.ones(30) / 30, "same")
        return x * np.minimum(1, np.arange(L) / (SR * 0.3)) * np.exp(-np.arange(L) / SR * 1.5) * 0.6
    return np.zeros(1, dtype=np.float32)


def curious_bed(n, rng, bpm=96, drums_from=2.5, accent_at=None):
    """Интригующий научный грув (синтез): электропиано Dm–B♭–Gm–A, щипковые арпеджио,
    саб-бас, мягкий бит. До drums_from — только пиано и арпеджио. accent_at — «удар» на ответе."""
    out = np.zeros(n, dtype=np.float32)
    beat = 60 / bpm; bar = 4 * beat
    f = lambda m: 440.0 * 2 ** ((m - 69) / 12)
    prog = [[50, 53, 57, 60, 64], [46, 50, 53, 57, 62], [43, 46, 50, 53, 57], [45, 49, 52, 55, 64]]  # Dm9, B♭maj7, Gm7, A7
    def ep(freq, dur, vel):
        L = int(SR * dur); t = np.arange(L) / SR
        env = np.exp(-t * 1.6) * np.minimum(1, t / 0.008)
        trem = 1 + 0.12 * np.sin(2 * np.pi * 4.5 * t)
        x = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t * 4) + 0.12 * np.sin(2 * np.pi * 3 * freq * t) * np.exp(-t * 8)
        return (x * env * trem * vel).astype(np.float32)
    def pluck(freq, vel):
        L = int(SR * 0.45); t = np.arange(L) / SR
        x = sum(np.sin(2 * np.pi * freq * k * t) * np.exp(-t * (6 + 5 * k)) / k for k in range(1, 6))
        return (x * np.minimum(1, t / 0.003) * vel).astype(np.float32)
    def kick():
        L = int(SR * 0.3); t = np.arange(L) / SR
        return (np.sin(2 * np.pi * np.cumsum(45 + 80 * np.exp(-t * 35)) / SR) * np.exp(-t * 11) * 0.5).astype(np.float32)
    def snap():
        L = int(SR * 0.18); x = rng.standard_normal(L).astype(np.float32)
        x = x - np.convolve(x, np.ones(8) / 8, "same")
        return x * np.exp(-np.arange(L) / SR * 22) * 0.12
    def hat():
        L = int(SR * 0.05); x = rng.standard_normal(L).astype(np.float32)
        x = x - np.convolve(x, np.ones(4) / 4, "same")
        return x * np.exp(-np.arange(L) / SR * 80) * 0.05
    K, Sn, arp_pat = kick(), snap(), [0, 2, 4, 2, 1, 3, 4, 3]
    i, t = 0, 0.0
    while t < n / SR:
        ch = prog[i % 4]
        for m in ch[1:]:
            add(out, ep(f(m), bar * 1.05, 0.05), t)
        add(out, ep(f(ch[0] - 12), bar, 0.10), t)                    # бас
        for k in range(16):                                           # арпеджио 16-ми
            m = ch[arp_pat[k % 8]] + 12
            add(out, pluck(f(m), 0.045 if k % 4 else 0.06), t + k * beat / 4)
        if t >= drums_from - 0.01:
            for b in range(4):
                tb = t + b * beat
                if b in (0, 2): add(out, K, tb)
                if b == 2 and (i % 2): add(out, K, tb + beat / 2)
                if b in (1, 3): add(out, Sn, tb)
                add(out, hat(), tb + beat / 2)
        i += 1; t += bar
    if accent_at is not None:
        L = int(SR * 2.2); tt = np.arange(L) / SR
        hit = sum(np.sin(2 * np.pi * f(m + 12) * tt) for m in (50, 57, 62, 65)) * np.exp(-tt * 1.8) * 0.06
        add(out, hit.astype(np.float32), accent_at)
        add(out, K * 1.4, accent_at)
    return out


def lowpass_fft(x, cutoff):
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (fr / cutoff) ** 4)
    return np.fft.irfft(X, len(x)).astype(np.float32)


def reverb_fft(x, decay=1.8, mix=0.25, rng=None):
    L = int(SR * decay); tt = np.arange(L) / SR
    ir = (rng.standard_normal(L) * np.exp(-tt * 6.9 / decay)).astype(np.float32)
    ir = lowpass_fft(ir, 5000); ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    N = 1 << int(np.ceil(np.log2(len(x) + L)))
    wet = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[: len(x)]
    return (x * (1 - mix) + wet * mix * 3).astype(np.float32)


def curious_bed2(n, rng, bpm=100, drums_from=2.5, accent_at=None, riser_at=None):
    """Тёплый «научный» грув: широкий пэд (детюн-пилы через фильтр), электропиано,
    арпеджио с эхом, мягкий бас, бит с шейкером, реверберация. Dm9–B♭maj7–Gm9–A7sus→A7."""
    beat = 60 / bpm; bar = 4 * beat
    f = lambda m: 440.0 * 2 ** ((m - 69) / 12)
    prog = [[38, 53, 57, 60, 64], [34, 50, 53, 57, 62], [31, 50, 53, 57, 58], [33, 50, 52, 55, 61]]
    pad = np.zeros(n, np.float32); keys = np.zeros(n, np.float32); arp = np.zeros(n, np.float32)
    bass = np.zeros(n, np.float32); drums = np.zeros(n, np.float32)
    def saw(fr, L):
        t = np.arange(L) / SR; return 2 * ((fr * t) % 1) - 1
    i, t = 0, 0.0
    while t < n / SR:
        ch = prog[i % 4]; L = int(SR * (bar + 0.6)); tt = np.arange(L) / SR
        env = np.minimum(1, tt / 0.6) * np.minimum(1, (L / SR - tt) / 0.6)
        x = sum(saw(f(m) * d, L) for m in ch[1:] for d in (0.996, 1.004))
        add(pad, (x * env * 0.03).astype(np.float32), t)
        for k, m in enumerate(ch[1:4]):                                  # электропиано
            Lk = int(SR * bar); tk = np.arange(Lk) / SR
            e = np.sin(2 * np.pi * f(m) * tk) + 0.3 * np.sin(4 * np.pi * f(m) * tk) * np.exp(-tk * 5)
            add(keys, (e * np.exp(-tk * 1.2) * np.minimum(1, tk / 0.01) * 0.05).astype(np.float32), t + k * 0.015)
        Lb = int(SR * bar * 0.95); tb = np.arange(Lb) / SR                # бас
        add(bass, (np.tanh(1.6 * np.sin(2 * np.pi * f(ch[0]) * tb)) * np.minimum(1, tb / 0.02) * np.exp(-tb * 0.6) * 0.16).astype(np.float32), t)
        pat = [1, 2, 3, 4, 3, 2, 4, 3]                                    # арпеджио + эхо 3/16
        for k in range(8):
            m = ch[pat[k]] + 12; Lp = int(SR * 0.5); tp = np.arange(Lp) / SR
            pl = sum(np.sin(2 * np.pi * f(m) * h * tp) * np.exp(-tp * (7 + 5 * h)) / h for h in range(1, 5))
            pl = (pl * np.minimum(1, tp / 0.003) * 0.05).astype(np.float32)
            tt0 = t + k * beat / 2
            add(arp, pl, tt0); add(arp, pl * 0.45, tt0 + 3 * beat / 4); add(arp, pl * 0.2, tt0 + 1.5 * beat)
        if t >= drums_from - 0.01:
            for b in range(4):
                tb0 = t + b * beat
                Lk = int(SR * 0.28); tk = np.arange(Lk) / SR
                if b in (0, 2) or (b == 3 and i % 2):
                    add(drums, (np.sin(2 * np.pi * np.cumsum(48 + 70 * np.exp(-tk * 30)) / SR) * np.exp(-tk * 10) * 0.42).astype(np.float32), tb0 + (beat / 2 if b == 3 else 0))
                if b in (1, 3):
                    nz = rng.standard_normal(int(SR * 0.2)).astype(np.float32); nz -= np.convolve(nz, np.ones(10) / 10, "same")
                    add(drums, nz * np.exp(-np.arange(len(nz)) / SR * 18) * 0.10, tb0)
                for h in range(4):                                       # шейкер 16-ми
                    nz = rng.standard_normal(int(SR * 0.04)).astype(np.float32); nz -= np.convolve(nz, np.ones(3) / 3, "same")
                    add(drums, nz * np.exp(-np.arange(len(nz)) / SR * 70) * (0.035 if h % 2 else 0.02), tb0 + h * beat / 4)
        i += 1; t += bar
    pad = lowpass_fft(pad, 1400)
    music = reverb_fft(pad + keys + arp, 2.2, 0.35, rng) + lowpass_fft(bass, 300) + drums
    if accent_at is not None:
        L = int(SR * 2.5); tt = np.arange(L) / SR
        hit = sum(np.sin(2 * np.pi * f(m) * tt) for m in (62, 69, 74, 77)) * np.exp(-tt * 1.5) * 0.05
        add(music, hit.astype(np.float32), accent_at)
    return music


def add(buf, clip, t):
    i = int(t * SR)
    if i < 0 or i >= len(buf):
        return
    j = min(len(buf), i + len(clip))
    buf[i:j] += clip[: j - i]


def main(project: Path, music: str | None):
    build = project / "build"
    voice = read_wav(build / "voice.wav")
    ev = json.loads((build / "events.json").read_text())
    out = np.zeros(max(len(voice), int(ev["total"] * SR) + SR), dtype=np.float32)
    out[: len(voice)] += voice
    rng = np.random.default_rng(7)
    p = pop()
    last = -1
    for t in ev["pops"]:
        if t - last > 0.09:  # не накладывать попы плотнее 90 мс
            add(out, p, t)
            last = t
    for t in ev["whooshes"]:
        add(out, whoosh(rng), t)

    for e in ev.get("sfx", []):
        add(out, sfx_clip(e["name"], rng), e["t"])
    if "--ambient" in sys.argv or "--rain" in sys.argv:
        fade = np.minimum(1, np.arange(len(out)) / (SR * 1.0)) * np.minimum(1, (len(out) - np.arange(len(out))) / (SR * 2.0))
        bed = np.zeros(len(out), dtype=np.float32)
        if "--ambient" in sys.argv:
            bed += ambient_pad(len(out), rng)
        if "--rain" in sys.argv:
            bed += rain_bed(len(out), rng)
        out += bed * fade

    if "--curious" in sys.argv or "--curious2" in sys.argv:
        tl = json.loads((build / "timings.json").read_text())
        seg = {x["id"]: x for x in tl["segments"]}
        a = sys.argv[sys.argv.index("--accent") + 1] if "--accent" in sys.argv else None
        acc = None
        if a:
            sid, _, wi = a.partition("#")
            acc = seg[sid]["words"][int(wi or 0)]["start"]
        drums = seg["s2"]["start"] if "s2" in seg else 2.5
        bed = (curious_bed2 if "--curious2" in sys.argv else curious_bed)(len(out), rng, drums_from=drums, accent_at=acc)
        fade = np.minimum(1, np.arange(len(out)) / (SR * 0.4)) * np.minimum(1, (len(out) - np.arange(len(out))) / (SR * 1.5))
        env = np.convolve(np.abs(np.pad(voice, (0, len(out) - len(voice)))), np.ones(SR // 8) / (SR // 8), "same")
        duck = np.convolve(np.where(env > 0.015, 0.3, 1.0), np.ones(SR // 6) / (SR // 6), "same")  # плавное приглушение
        out += bed * fade * duck * 0.9

    if "--beat" in sys.argv:
        bed = beat_bed(len(out), rng=rng)
        fade = np.minimum(1, np.arange(len(out)) / (SR * 0.5)) * np.minimum(1, (len(out) - np.arange(len(out))) / (SR * 1.2))
        env = np.convolve(np.abs(np.pad(voice, (0, len(out) - len(voice)))), np.ones(SR // 10) / (SR // 10), "same")
        out += bed * fade * np.where(env > 0.015, 0.38, 0.7)

    if music:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", music, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                             check=True, capture_output=True).stdout
        m = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
        m = np.resize(m, len(out)) * 0.12
        # приглушение музыки, пока звучит голос
        env = np.convolve(np.abs(np.pad(voice, (0, len(out) - len(voice)))), np.ones(SR // 5) / (SR // 5), mode="same")
        m *= np.where(env > 0.02, 0.45, 1.0)
        out += m

    peak = np.max(np.abs(out)) or 1
    if peak > 0.98:
        out *= 0.98 / peak
    pcm = (out * 32767).astype(np.int16)
    with wave.open(str(build / "final.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("звук:", build / "final.wav")


if __name__ == "__main__":
    a = sys.argv[1:]
    music = a[a.index("--music") + 1] if "--music" in a else None
    main(Path(a[0]).resolve(), music)
