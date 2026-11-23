#!/usr/bin/env python3
"""Озвучка + тайминги.

Для каждого сегмента из script.json:
  * если есть запись диктора  <project>/voice/<id>.(wav|m4a|mp3|ogg) — берём её
    (тишина в начале/конце обрезается);
  * иначе синтезируем черновик через espeak-ng (голос ky).
Результат в <project>/build/:
  voice.wav     — вся дорожка голоса (44.1 кГц, моно)
  timings.json  — начало/конец каждого сегмента и примерные тайминги слов
"""
import json
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path

SR = 44100
AUDIO_EXT = (".wav", ".m4a", ".mp3", ".ogg", ".aac")


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def to_pcm(src: Path, dst: Path, trim: bool):
    af = []
    if trim:
        # обрезать тишину в начале и в конце записи
        af.append("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05")
        af.append("areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse")
    af.append("loudnorm=I=-16:TP=-1.5:LRA=11")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-af", ",".join(af),
         "-ar", str(SR), "-ac", "1", "-sample_fmt", "s16", str(dst)])


def read_frames(p: Path) -> bytes:
    with wave.open(str(p)) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1 and w.getsampwidth() == 2
        return w.readframes(w.getnframes())


def word_timings(text: str, start: float, end: float):
    words = text.split()
    # вес слова ≈ число букв + небольшая пауза после знаков препинания
    weights = []
    for w in words:
        letters = len(re.sub(r"[^\w₀-₉]", "", w)) or 1
        pause = 2.5 if re.search(r"[.,:;?!—]$", w) or w == "—" else 0
        weights.append(letters + 1.2 + pause)
    total = sum(weights)
    t, out = start, []
    for w, k in zip(words, weights):
        d = (end - start) * k / total
        out.append({"w": w, "start": round(t, 3), "end": round(t + d, 3)})
        t += d
    return out


def main(project: Path):
    script = json.loads((project / "script.json").read_text(encoding="utf-8"))
    build = project / "build"
    seg_dir = build / "seg"
    seg_dir.mkdir(parents=True, exist_ok=True)
    gap = float(script.get("gap_seconds", 0.28))
    tail = float(script.get("tail_seconds", 1.5))
    lead = 0.35  # тишина перед первой фразой

    if not shutil.which("espeak-ng"):
        print("! espeak-ng не найден: нужны записи для всех сегментов", file=sys.stderr)

    pcm = bytearray(b"\x00\x00" * int(SR * lead))
    t = lead
    segs = []
    used_rec = 0
    for seg in script["segments"]:
        sid = seg["id"]
        out = seg_dir / f"{sid}.wav"
        rec = next((project / "voice" / f"{sid}{e}" for e in AUDIO_EXT
                    if (project / "voice" / f"{sid}{e}").exists()), None)
        if rec:
            to_pcm(rec, out, trim=True)
            used_rec += 1
        else:
            raw = seg_dir / f"{sid}.espeak.wav"
            run(["espeak-ng", "-v", "ky", "-s", "178", "-p", "45", "-g", "2",
                 "-w", str(raw), seg.get("say", seg["show"])])
            to_pcm(raw, out, trim=True)
        frames = read_frames(out)
        dur = len(frames) / 2 / SR
        segs.append({
            "id": sid,
            "start": round(t, 3),
            "end": round(t + dur, 3),
            "show": seg["show"],
            "words": word_timings(seg["show"], t, t + dur),
        })
        pcm += frames
        pcm += b"\x00\x00" * int(SR * gap)
        t += dur + gap

    total = t - gap + tail
    pcm += b"\x00\x00" * int(SR * (tail - gap))
    with wave.open(str(build / "voice.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(pcm))

    timings = {"fps": 30, "total": round(total, 3), "segments": segs}
    js = json.dumps(timings, ensure_ascii=False, indent=1)
    (build / "timings.json").write_text(js, encoding="utf-8")
    (build / "timings.js").write_text("window.TIMINGS = " + js + ";\n", encoding="utf-8")
    print(f"сегментов: {len(segs)}, записей диктора: {used_rec}, длительность: {total:.1f} c")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
