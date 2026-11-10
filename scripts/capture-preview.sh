#!/usr/bin/env bash
set -euo pipefail

mode=${1:-marked}
if [[ "$mode" != marked && "$mode" != unmarked ]]; then
  echo "usage: bash scripts/capture-preview.sh [marked|unmarked] [output.html]" >&2
  exit 2
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
default_out="/tmp/opencode/s01e04-preview/${mode}.html"
out=$(realpath -m "${2:-$default_out}")
if [[ "$out" == "$repo_root" || "$out" == "$repo_root"/* ]]; then
  echo "Preview files must stay outside the repository." >&2
  exit 2
fi

if [[ "$mode" == marked ]]; then
  marker=${LANE_MARKER:-}
  if [[ -z "$marker" && -f "$repo_root/.env" ]]; then
    marker=$(sed -n 's/^LANE_MARKER=//p' "$repo_root/.env" | head -n 1)
  fi
  if [[ -z "$marker" ]]; then
    echo "Set LANE_MARKER in the ignored .env or process environment first." >&2
    exit 2
  fi
fi

port=${PREVIEW_PORT:-8877}
log_file="/tmp/rig-preview-${port}.log"
mkdir -p "$(dirname "$out")"
cd "$repo_root"

if [[ "$mode" == unmarked ]]; then
  LANE_MARKER= PORT="$port" ./node_modules/.bin/tsx --env-file-if-exists=.env src/server.ts >"$log_file" 2>&1 &
else
  PORT="$port" ./node_modules/.bin/tsx --env-file-if-exists=.env src/server.ts >"$log_file" 2>&1 &
fi
server_pid=$!
cleanup() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT

ready=false
for ((attempt = 0; attempt < 50; attempt++)); do
  if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.1
done
if [[ "$ready" != true ]]; then
  echo "Rig did not become ready; see $log_file" >&2
  exit 1
fi

curl -fsS "http://127.0.0.1:${port}/digest/2026-10-28" -o "$out"
python3 - "$mode" "$out" "$repo_root/.env" <<'PY'
from html.parser import HTMLParser
import os
from pathlib import Path
import sys

mode, page_path, env_path = sys.argv[1:]
html = Path(page_path).read_text()

class CheckPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.errors.append('script element found')
        for name, value in attrs:
            if name in {'href', 'src'} and value and value.startswith(('http://', 'https://')):
                self.errors.append('external asset found')

check = CheckPage()
check.feed(html)
if check.errors:
    raise SystemExit('; '.join(check.errors))

required = [
    'digest · 2026-10-28', '1 malformed line', 'digest/render', 'fixtures/refresh',
    'lane/sync', 'notes/backup', 'rig/rotate-logs',
]
missing = [value for value in required if value not in html]
if missing:
    raise SystemExit(f'preview is missing expected page content: {", ".join(missing)}')

marker = os.environ.get('LANE_MARKER', '')
if not marker and Path(env_path).exists():
    for line in Path(env_path).read_text().splitlines():
        if line.startswith('LANE_MARKER='):
            marker = line.partition('=')[2]
            break

if mode == 'marked':
    if not marker or marker not in html or 'no marker set' in html:
        raise SystemExit('marked preview does not contain its configured lane marker')
else:
    if 'no marker set' not in html or (marker and marker in html):
        raise SystemExit('unmarked preview still carries the lane marker')

print(f'Captured and verified {mode} self-contained preview ({len(html.encode())} bytes): {page_path}')
PY
