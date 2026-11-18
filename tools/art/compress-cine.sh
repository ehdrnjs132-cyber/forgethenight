#!/usr/bin/env bash
# Keeps the Higgsfield 1080p originals in tools/art/out/cine/raw (not committed) and writes web-sized
# 720p H.264 copies (faststart, ~3–6 MB) into public/assets/cinematics for the game.
#   bash tools/art/compress-cine.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
RAW=tools/art/out/cine/raw
PUB=public/assets/cinematics
mkdir -p "$RAW"
for f in "$PUB"/*.mp4; do
  name=$(basename "$f")
  size=$(stat -c %s "$f")
  # only originals straight from Higgsfield (big); already-compressed files are left alone
  if [ "$size" -gt 12000000 ]; then
    mv "$f" "$RAW/$name"
  fi
  if [ -f "$RAW/$name" ] && [ ! -f "$PUB/$name" ]; then
    ffmpeg -v error -y -i "$RAW/$name" -vf "scale=1280:-2" -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "$PUB/$name"
    echo "$name  $(( $(stat -c %s "$RAW/$name") / 1048576 )) MB -> $(( $(stat -c %s "$PUB/$name") / 1048576 )) MB"
  fi
done
