#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  echo "Virtuelle Umgebung fehlt. Bitte zuerst ausführen:"
  echo "  python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi
exec .venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080 "$@"
