#!/bin/sh
# Starts Fuji Recipe Converter on this computer and opens it in your browser.
# macOS / Linux. Needs Python 3 (preinstalled on most systems).
cd "$(dirname "$0")" || exit 1
PORT="${1:-8173}"
URL="http://localhost:$PORT/"

if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1; then PY=python
else
  echo "Python 3 was not found. Install it from https://www.python.org/ or serve this folder with any static web server."
  exit 1
fi

echo ""
echo "  Fuji Recipe Converter is running at $URL"
echo "  Keep this window open while you use the app. Press Ctrl+C to stop."
echo ""
( sleep 1; if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; fi ) >/dev/null 2>&1 &
exec "$PY" -m http.server "$PORT" --bind 127.0.0.1
