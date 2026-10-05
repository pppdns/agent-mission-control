#!/usr/bin/env bash
# Contact sheet for review: sheet.sh <out.png> <shot> [<shot> ...] — four frames per shot, one row each.
set -euo pipefail
cd "$(dirname "$0")"
out=$1
shift
rows=()
for shot in "$@"; do
  n=$(ls "frames/$shot" | wc -l | tr -d ' ')
  inputs=()
  for p in 10 35 65 95; do
    idx=$(printf "%05d" $(((n - 1) * p / 100)))
    inputs+=(-i "frames/$shot/$idx.jpg")
  done
  ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "[0]scale=480:-1[a];[1]scale=480:-1[b];[2]scale=480:-1[c];[3]scale=480:-1[d];[a][b][c][d]hstack=4" "tmp/row-$shot.png"
  rows+=(-i "tmp/row-$shot.png")
done
if [ ${#rows[@]} -eq 2 ]; then
  cp "tmp/row-$1.png" "$out"
else
  ffmpeg -y -loglevel error "${rows[@]}" -filter_complex "vstack=inputs=$#" "$out"
fi
