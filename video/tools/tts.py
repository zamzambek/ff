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


def precise_words(show: str, spans, t0: float):
    """Точные тайминги слов от ElevenLabs. Если в субтитре другие слова (формулы), делим по длине."""
    words = show.split()
    if len(words) == len(spans):
        return [{"w": w, "start": round(t0 + s, 3), "end": round(t0 + e, 3)} for w, (_, s, e) in zip(words, spans)]
    return word_timings(show, t0 + spans[0][1], t0 + spans[-1][2])


def write_timings(build, segs, total):
    timings = {"fps": 30, "total": round(total, 3), "segments": segs}
    js = json.dumps(timings, ensure_ascii=False, indent=1)
    (build / "timings.json").write_text(js, encoding="utf-8")
    (build / "timings.js").write_text("window.TIMINGS = " + js + ";\n", encoding="utf-8")


VOWELS = set("аеёиоуыэюяөүАЕЁИОУЫЭЮЯӨҮ")
SPOKEN = {"KAINAP": 2}  # слова латиницей/цифрами: сколько слогов звучит


def vowel_count(word: str) -> float:
    core = re.sub(r"[^\w₀-₉]", "", word)
    if core in SPOKEN:
        return SPOKEN[core]
    n = sum(ch in VOWELS for ch in core)
    n += sum(ch.isascii() and ch.isalpha() for ch in core)          # C, O, H… читаются «цэ», «о», «аш»
    n += 2 * sum(ch in "₀₁₂₃₄₅₆₇₈₉" for ch in core)                 # ₂ → «эки»
    digits = re.sub(r"\D", "", core)
    n += 1.5 * len(digits)                                          # 200 → «эки жүз»
    return max(n, 1)


def syllable_peaks(wav: Path):
    """Примерные центры слогов: пики громкости речевой полосы."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(wav), "-af", "highpass=f=250,lowpass=f=2500",
                          "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], check=True, capture_output=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    hop, win = 160, 400
    n = len(x) // hop - 3
    e = np.array([np.sqrt(np.mean(x[i * hop:i * hop + win] ** 2) + 1e-12) for i in range(n)])
    db = np.convolve(20 * np.log10(e), np.hanning(9) / np.hanning(9).sum(), "same")
    floor = np.percentile(db, 95) - 30
    peaks = []
    for i in range(12, len(db) - 13):
        if db[i] > floor and db[i] >= db[i - 1] and db[i] >= db[i + 1] \
                and db[i] - db[i - 12:i].min() > 3 and db[i] - db[i + 1:i + 13].min() > 3:
            t = i * 0.01
            if not peaks or t - peaks[-1] > 0.09:
                peaks.append(t)
    return peaks


def take_mode(script, take: Path, build: Path, lead: float, tail: float):
    """Одна запись на весь текст: слова раскладываются по слогам записи."""
    import numpy as np
    clean = build / "take.wav"
    to_pcm(take, clean, trim=True)
    frames = read_frames(clean)
    speech = len(frames) / 2 / SR
    peaks = syllable_peaks(clean)
    words = [(si, w, vowel_count(w)) for si, seg in enumerate(script["segments"]) for w in seg["show"].split()]
    total_v = sum(v for _, _, v in words)
    # k-й слог текста → время: линейная интерполяция по найденным пикам (их обычно меньше, чем гласных)
    grid = np.linspace(0, total_v, len(peaks))
    at = lambda k: float(np.interp(k, grid, peaks))
    segs = [{"id": s["id"], "show": s["show"], "words": []} for s in script["segments"]]
    acc = 0.0
    for si, w, v in words:
        start = max(0.0, at(acc) - 0.12) if acc > 0 else 0.0
        end = at(acc + v - 1) + 0.15 if acc + v < total_v else speech
        segs[si]["words"].append({"w": w, "start": round(lead + start, 3), "end": round(lead + end, 3)})
        acc += v
    for s in segs:
        s["start"], s["end"] = s["words"][0]["start"], s["words"][-1]["end"]
    pcm = b"\x00\x00" * int(SR * lead) + frames + b"\x00\x00" * int(SR * tail)
    with wave.open(str(build / "voice.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm)
    return segs, lead + speech + tail


def main(project: Path):
    script = json.loads((project / "script.json").read_text(encoding="utf-8"))
    build = project / "build"
    seg_dir = build / "seg"
    seg_dir.mkdir(parents=True, exist_ok=True)
    gap = float(script.get("gap_seconds", 0.28))
    tail = float(script.get("tail_seconds", 1.5))
    lead = 0.35  # тишина перед первой фразой

    take = next((project / "voice" / f"take{e}" for e in AUDIO_EXT if (project / "voice" / f"take{e}").exists()), None)
    if take:
        segs, total = take_mode(script, take, build, lead, tail)
        write_timings(build, segs, total)
        print(f"один дубль: {take.name}, сегментов: {len(segs)}, длительность: {total:.1f} c")
        return

    if not shutil.which("espeak-ng"):
        print("! espeak-ng не найден: нужны записи для всех сегментов", file=sys.stderr)

    el_cfg = script.get("tts") if (script.get("tts") or {}).get("provider") == "elevenlabs" else None
    if el_cfg and not el_cfg.get("voice_id"):
        sys.exit("В script.json → tts.voice_id не указан голос ElevenLabs (список: python3 tools/elevenlabs.py voices)")

    pcm = bytearray(b"\x00\x00" * int(SR * lead))
    t = lead
    segs = []
    used_rec = used_el = 0
    all_segs = script["segments"]
    for k, seg in enumerate(all_segs):
        sid = seg["id"]
        out = seg_dir / f"{sid}.wav"
        rec = next((project / "voice" / f"{sid}{e}" for e in AUDIO_EXT
                    if (project / "voice" / f"{sid}{e}").exists()), None)
        spans = None
        if rec:
            to_pcm(rec, out, trim=True)
            used_rec += 1
        elif el_cfg:
            sys.path.insert(0, str(Path(__file__).parent))
            import elevenlabs
            say = seg.get("say", seg["show"])
            prev = all_segs[k - 1].get("say", all_segs[k - 1]["show"]) if k else None
            nxt = all_segs[k + 1].get("say", all_segs[k + 1]["show"]) if k + 1 < len(all_segs) else None
            mp3, chars = elevenlabs.synth(el_cfg, say, prev, nxt, cache_dir=build / "el-cache")
            (seg_dir / f"{sid}.mp3").write_bytes(mp3)
            to_pcm(seg_dir / f"{sid}.mp3", out, trim=False)
            spans = elevenlabs.word_spans(chars)
            used_el += 1
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
            "words": precise_words(seg["show"], spans, t) if spans else word_timings(seg["show"], t, t + dur),
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

    write_timings(build, segs, total)
    print(f"сегментов: {len(segs)}, записей диктора: {used_rec}, ElevenLabs: {used_el}, длительность: {total:.1f} c")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
