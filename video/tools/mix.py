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
