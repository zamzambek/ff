#!/usr/bin/env python3
"""Нарезка одной длинной записи диктора на фразы s1..sN.

  python3 tools/split_take.py <project> <запись.m4a>

Как это работает (распознавания речи нет, только паузы):
  1. находим все паузы в записи (тишина ≥ 0.2 с);
  2. ожидаемая длина каждой фразы берётся из черновой озвучки (build/timings.json),
     поэтому сначала нужно один раз запустить tools/tts.py;
  3. динамическим программированием выбираем N-1 пауз-границ так, чтобы длины
     кусков лучше всего совпадали с ожидаемыми (по логарифму отношения).
Результат: <project>/voice/s1.wav … sN.wav и отчёт для проверки на слух.
Если диктор читал не по тексту или пропускал фразы, нарезка будет неверной: проверь отчёт.
"""
import json
import math
import re
import subprocess
import sys
from pathlib import Path


def pauses(src, db=-36, dur=0.2):
    r = subprocess.run(["ffmpeg", "-i", src, "-af", f"silencedetect=n={db}dB:d={dur}", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r)]
    en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r)]
    total = float(re.search(r"Duration: (\d+):(\d+):([\d.]+)", r).groups()[2]) + \
        60 * int(re.search(r"Duration: (\d+):(\d+)", r).group(2))
    if len(en) < len(st):
        en.append(total)
    return list(zip(st, en)), total


def main(project: Path, src: str):
    T = json.loads((project / "build" / "timings.json").read_text(encoding="utf-8"))
    ids = [s["id"] for s in T["segments"]]
    exp = [s["end"] - s["start"] for s in T["segments"]]
    P, total = pauses(src)
    start = P[0][1] if P and P[0][0] < 0.05 else 0.0
    end = P[-1][0] if P and P[-1][1] >= total - 0.05 else total
    cand = [p for p in P if p[0] > start + 0.2 and p[1] < end - 0.2]
    n, m = len(exp), len(cand)
    if m < n - 1:
        sys.exit(f"Пауз ({m}) меньше, чем нужно границ ({n - 1}). Запиши с паузами между фразами.")
    scale = (end - start) / sum(exp)

    def cost(i, a, b):
        s = start if a < 0 else cand[a][1]
        e = end if b == m else cand[b][0]
        d = e - s
        return math.inf if d < 0.4 else math.log(d / (exp[i] * scale)) ** 2

    # D[i][b] — лучшая цена для первых i+1 фраз, если фраза i кончается на границе b
    D = [[math.inf] * (m + 1) for _ in range(n)]
    B = [[-1] * (m + 1) for _ in range(n)]
    for b in range(m + 1):
        D[0][b] = cost(0, -1, b)
    for i in range(1, n):
        for b in range(i, m + 1):
            for a in range(i - 1, b):
                v = D[i - 1][a] + cost(i, a, b)
                if v < D[i][b]:
                    D[i][b], B[i][b] = v, a
    bounds, b = [], m
    for i in range(n - 1, -1, -1):
        bounds.append(b)
        b = B[i][b]
    bounds.reverse()

    out = project / "voice"
    out.mkdir(exist_ok=True)
    print(f"{'фраза':6} {'начало':>7} {'конец':>7} {'длина':>6} {'ожид.':>6}")
    a = -1
    for i, b in enumerate(bounds):
        s = start if a < 0 else cand[a][1]
        e = end if b == m else cand[b][0]
        s, e = max(0, s - 0.08), e + 0.12  # небольшой запас, чтобы не съесть начало/конец слова
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-ss", f"{s:.3f}", "-to", f"{e:.3f}",
                        "-ac", "1", "-ar", "44100", str(out / f"{ids[i]}.wav")], check=True)
        flag = "  ← проверь" if abs(math.log((e - s) / (exp[i] * scale))) > 0.45 else ""
        print(f"{ids[i]:6} {s:7.2f} {e:7.2f} {e - s:6.2f} {exp[i] * scale:6.2f}{flag}")
        a = b


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve(), sys.argv[2])
