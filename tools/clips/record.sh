#!/bin/bash
# Re-record the Help video guides: node tools/clips/record.sh [00|01|02|03|04|05|06|07]  (no argument = all).
# Each clip gets a fresh FRAME driver (headless Chrome); its last frame is the poster Help shows.
set -e
cd "$(dirname "$0")/../.."
for clip in 00-new-project 01-floor-plan 02-client-elevation 03-spec-a-piece 04-lay-out-the-wall 05-elevation-tour 06-deck-pages 07-preflight-pdf; do
  n=${clip:0:2}
  if [ -n "$1" ] && [ "$1" != "$n" ]; then continue; fi
  node tools/frame-driver.js stop >/dev/null 2>&1 || true
  node tools/frame-driver.js start --port 8797 >/dev/null
  node tools/clips/$clip.js
done
node tools/frame-driver.js stop >/dev/null 2>&1 || true
ls -la help/clips
