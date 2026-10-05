#!/usr/bin/env bash
# Review aid: grid.sh <shot> <frame> [<frame> ...] writes tmp/grid-<shot>-<frame>.png, the frame at 1600x900
# with a 100px magenta grid and heavier yellow lines every 500px (x) / 300px (y).
set -euo pipefail
cd "$(dirname "$0")"
shot=$1
shift
mkdir -p tmp
for f in "$@"; do
  ffmpeg -y -loglevel error -i "frames/$shot/$(printf '%05d' "$f").jpg" \
    -vf "scale=1600:900,drawgrid=w=100:h=100:t=1:c=magenta@0.30,drawgrid=w=500:h=300:t=2:c=yellow@0.65" \
    "tmp/grid-$shot-$f.png"
done
