#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
PORT=8765
URL="http://127.0.0.1:${PORT}"

echo "Starting Furigana Lyrics at ${URL} ..."
(sleep 0.6 && open "${URL}") &
exec python3 -m http.server "${PORT}" --bind 127.0.0.1
