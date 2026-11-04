#!/bin/bash
# Seed Scent: open the website on this Mac. Works with no internet.
#
# Double-click this file. It starts a tiny local web server in this folder
# and opens the site in your browser. Keep the window open while you use
# the site. Close the window, or press Control-C, to stop.
#
# Why a server at all: browsers refuse to load the moving parts (ES modules,
# the 3D engine) from an index.html that was opened by double-clicking it.
#
# Testing only: SEED_SCENT_PORT=3005 bash start.command  (uses another port)

cd "$(dirname "$0")" || exit 1

PORT="${SEED_SCENT_PORT:-3001}"
URL="http://127.0.0.1:$PORT/"

# python3 ships with macOS. Fall back to plain python if that is all there is.
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "Python was not found, so the server cannot start."
  echo "Install Python 3 from https://www.python.org/downloads/ or serve this folder with any static web server."
  read -r -p "Press Return to close this window. "
  exit 1
fi

# Already running? (This file was probably double-clicked twice.)
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Something is already serving port $PORT, probably an earlier copy of this window."
  echo "Opening $URL in your browser."
  open "$URL"
  read -r -p "Press Return to close this window. "
  exit 0
fi

echo "Seed Scent"
echo "Serving this folder at $URL"
echo "Keep this window open while you use the site. Close it, or press Control-C, to stop."
echo

# Open the browser once the server has had a moment to start.
( sleep 1.5; open "$URL" ) &

"$PY" -m http.server "$PORT" --bind 127.0.0.1
STATUS=$?

echo
echo "The server stopped (exit code $STATUS)."
read -r -p "Press Return to close this window. "
