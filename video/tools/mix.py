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
    if name == "riser":
        L = int(SR * 1.25); tt = np.arange(L) / SR
        x = rng.standard_normal(L).astype(np.float32)
        k = np.convolve(x, np.ones(8) / 8, "same")
        tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * (tt / 1.25) ** 2) / SR)
        return (k * 0.25 + tone * 0.08) * (tt / 1.25) ** 2
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
