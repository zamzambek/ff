#!/usr/bin/env bash
# Приклеить общую концовку KAINAP к ролику с плавным переходом.
#   tools/append_outro.sh <ролик.mp4> <секунда_обрезки> <выход.mp4> [концовка.mp4]
# секунда_обрезки — где заканчивается основная часть (до собственной финальной карточки ролика).
set -euo pipefail
IN="$1"; CUT="$2"; OUT="$3"; OUTRO="${4:-$(dirname "$0")/../projects/outro3/build/outro3.mp4}"
X=$(python3 -c "print($CUT-0.6)")
ffmpeg -v error -y -i "$IN" -i "$OUTRO" -filter_complex \
 "[0:v]trim=0:$CUT,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v0];[1:v]fps=30,format=yuv420p,setpts=PTS-STARTPTS[v1];\
[v0][v1]xfade=transition=fade:duration=0.6:offset=$X[v];[0:a]atrim=0:$CUT,asetpts=PTS-STARTPTS[a0];[1:a]asetpts=PTS-STARTPTS[a1];[a0][a1]acrossfade=d=0.6[a]" \
 -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 192k -movflags +faststart "$OUT"
echo "Готово: $OUT"
