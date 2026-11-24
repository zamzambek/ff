#!/usr/bin/env python3
"""Озвучка через ElevenLabs API (с таймингами каждой буквы).

Ключ API НЕ хранится в коде: его подставляет сетевой прокси окружения
(или переменная ELEVENLABS_API_KEY при локальном запуске).

Отдельно:
  python3 tools/elevenlabs.py voices                 — список доступных голосов (id и имя)
  python3 tools/elevenlabs.py say <voice_id> "текст" — пробный файл build/el-test.mp3
"""
import base64
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.elevenlabs.io"
# если ключ подставляет прокси, в заголовке достаточно заглушки
KEY = os.environ.get("ELEVENLABS_API_KEY", "proxy-injected")


def _req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"xi-api-key": KEY, "Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"ElevenLabs {e.code}: {e.read().decode(errors='replace')[:400]}")


def voices():
    return [(v["voice_id"], v["name"], v.get("category", "")) for v in _req("GET", "/v2/voices?page_size=100")["voices"]]


def synth(cfg, text, prev_text=None, next_text=None, cache_dir: Path | None = None):
    """Возвращает (mp3_bytes, [(char, start, end), ...]). Результат кешируется: повтор не тратит кредиты."""
    body = {"text": text, "model_id": cfg.get("model_id", "eleven_v3")}
    if cfg.get("language_code"):
        body["language_code"] = cfg["language_code"]
    if cfg.get("seed") is not None:
        body["seed"] = cfg["seed"]
    if cfg.get("voice_settings"):
        body["voice_settings"] = cfg["voice_settings"]
    if prev_text and cfg.get("context", True):
        body["previous_text"] = prev_text
    if next_text and cfg.get("context", True):
        body["next_text"] = next_text
    key = hashlib.sha1(json.dumps([cfg["voice_id"], body], ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    if cache_dir:
        cache_dir.mkdir(parents=True, exist_ok=True)
        hit = cache_dir / f"{key}.json"
        if hit.exists():
            res = json.loads(hit.read_text())
            return base64.b64decode(res["audio_base64"]), _chars(res)
    res = _req("POST", f"/v1/text-to-speech/{cfg['voice_id']}/with-timestamps?output_format=mp3_44100_128", body)
    if cache_dir:
        (cache_dir / f"{key}.json").write_text(json.dumps(res))
    return base64.b64decode(res["audio_base64"]), _chars(res)


def _chars(res):
    a = res.get("alignment") or res.get("normalized_alignment") or {}
    return list(zip(a.get("characters", []), a.get("character_start_times_seconds", []),
                    a.get("character_end_times_seconds", [])))


def word_spans(chars):
    """Слова и их время из посимвольных таймингов."""
    words, cur = [], None
    for ch, s, e in chars:
        if ch.isspace():
            cur = None
            continue
        if cur is None:
            cur = [ch, s, e]
            words.append(cur)
        else:
            cur[0] += ch
            cur[2] = e
    return [(w, s, e) for w, s, e in words]


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "voices":
        for vid, name, cat in voices():
            print(f"{vid}  {name}  ({cat})")
    elif len(sys.argv) > 3 and sys.argv[1] == "say":
        mp3, chars = synth({"voice_id": sys.argv[2]}, sys.argv[3])
        Path("build").mkdir(exist_ok=True)
        Path("build/el-test.mp3").write_bytes(mp3)
        print("build/el-test.mp3;", " ".join(f"{w}@{s:.2f}" for w, s, _ in word_spans(chars)))
    else:
        print(__doc__)
