#!/usr/bin/env bash
# Joins the recorded segments per emulator and extracts one frame per 20 s for review.
set -uo pipefail
cd out
mkdir -p frames
for w in a b; do
  ls video/${w}_rec_*.mp4 >/dev/null 2>&1 || { echo "no video for $w"; continue; }
  for f in video/${w}_rec_*.mp4; do echo "file '$PWD/$f'"; done > video/$w.txt
  if ffmpeg -y -loglevel error -f concat -safe 0 -i video/$w.txt -c copy "emulator_$w.mp4"; then
    rm -f video/${w}_rec_*.mp4 video/$w.txt
    ffmpeg -y -loglevel error -i "emulator_$w.mp4" -vf "fps=1/20,scale=360:-2" "frames/${w}_%03d.jpg" || true
    echo "emulator_$w.mp4: $(ffprobe -v error -show_entries format=duration -of csv=p=0 emulator_$w.mp4) s"
  fi
done
if [ -f emulator_a.mp4 ] && [ -f emulator_b.mp4 ]; then
  ffmpeg -y -loglevel error -i emulator_a.mp4 -i emulator_b.mp4 \
    -filter_complex "[0:v]scale=-2:1280[l];[1:v]scale=-2:1280[r];[l][r]hstack=inputs=2" \
    -c:v libx264 -preset ultrafast -crf 30 -an -shortest side_by_side.mp4 || true
fi
ls -lh . | head -30
