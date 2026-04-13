#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HOOK_SCRIPT="$PROJECT_DIR/bin/datalox-auto-promote.js"

if [ ! -f "$HOOK_SCRIPT" ]; then
  exit 0
fi

node "$HOOK_SCRIPT" --repo "$PROJECT_DIR"
