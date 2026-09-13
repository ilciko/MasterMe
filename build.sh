#!/bin/sh
# Inlinea src/* in dist/master.html (unico file, zero dipendenze esterne).
set -e
cd "$(dirname "$0")"
mkdir -p dist
out=dist/master.html
: > "$out"
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    *'<link rel="stylesheet" href="'*)
      f=${line#*href=\"}; f=${f%%\"*}
      { echo "<style>"; cat "src/$f"; echo "</style>"; } >> "$out" ;;
    *'<script src="'*)
      f=${line#*src=\"}; f=${f%%\"*}
      { echo "<script>"; cat "src/$f"; echo "</script>"; } >> "$out" ;;
    *) printf '%s\n' "$line" >> "$out" ;;
  esac
done < src/index.html
if grep -nE '<script src=|<link ' "$out"; then echo "ERRORE: riferimenti esterni rimasti" >&2; exit 1; fi
echo "OK: $out ($(wc -c < "$out" | tr -d ' ') byte)"
