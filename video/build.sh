#!/usr/bin/env bash
# Полная сборка ролика:  ./build.sh projects/co-vs-co2 [--music track.mp3]
set -euo pipefail
cd "$(dirname "$0")"
P="${1:?укажи папку проекта, например projects/co-vs-co2}"; shift || true
NAME="$(basename "$P")"

echo "1/4 озвучка и тайминги";  python3 tools/tts.py "$P"
echo "2/4 рендер кадров";       node tools/render.js "$P"
echo "3/4 сведение звука";      python3 tools/mix.py "$P" "$@"
echo "4/4 склейка"
ffmpeg -y -v error -i "$P/build/silent.mp4" -i "$P/build/final.wav" \
  -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$P/build/$NAME.mp4"
echo "Готово: $P/build/$NAME.mp4"
