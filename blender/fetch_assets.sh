#!/bin/sh
# CC0 textures and HDRIs from Poly Haven used by the Blender renders (about 60 MB).
set -e
D="$(cd "$(dirname "$0")" && pwd)/assets"; mkdir -p "$D"; cd "$D"
B=https://dl.polyhaven.org/file/ph-assets
# Download to a temp name first so a dropped connection never leaves a file that looks done.
get() { f="$(basename "$1")"; [ -s "$f" ] || { curl -sfL -o "$f.part" "$B/$1" && mv "$f.part" "$f"; }; }
for m in diff nor_gl rough; do get Textures/jpg/4k/coast_sand_01/coast_sand_01_${m}_4k.jpg; done
for m in diff rough; do get Textures/jpg/4k/white_marble/white_marble_${m}_4k.jpg; done
for m in diff nor_gl rough; do get Textures/jpg/4k/wood_table_001/wood_table_001_${m}_4k.jpg; done
get HDRIs/hdr/2k/studio_small_09_2k.hdr
echo "assets in $D"
