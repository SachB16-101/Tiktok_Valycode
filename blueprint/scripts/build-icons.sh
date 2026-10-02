#!/usr/bin/env bash
# Regenerates the inline Phosphor sprite in index.html.
# Only needed when a new icon is used in the app.
set -euo pipefail

ICONS=(check moon-stars fork-knife barbell drop smiley tooth scissors ruler flask books
       calendar-check gear caret-down caret-right caret-left x plus camera warning info
       arrow-right chart-line clock download-simple upload-simple seal-check question
       lightning wind footprints pencil-simple trash sun-horizon person-simple-walk
       heartbeat bed target circle-dashed arrow-counter-clockwise)

tmp=$(mktemp -d)
npm pack @phosphor-icons/core --pack-destination "$tmp" --silent >/dev/null
tar xzf "$tmp"/*.tgz -C "$tmp"
src="$tmp/package/assets/regular"

out="$(dirname "$0")/../icons.svg"
printf '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n' > "$out"
for i in "${ICONS[@]}"; do
  body=$(sed -e 's|<svg[^>]*>||' -e 's|</svg>||' "$src/$i.svg" | tr -d '\n')
  printf '<symbol id="i-%s" viewBox="0 0 256 256" fill="currentColor">%s</symbol>\n' "$i" "$body" >> "$out"
done
printf '</svg>\n' >> "$out"

echo "Wrote $out. Paste its contents into index.html, replacing the existing inline sprite."
