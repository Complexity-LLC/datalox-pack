#!/usr/bin/env bash
set -euo pipefail

PACK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_REPO="${1:-}"

if [ -z "$HOST_REPO" ]; then
  echo "Usage: bash bin/adopt-host-repo.sh /path/to/host-repo"
  exit 1
fi

HOST_REPO="$(cd "$HOST_REPO" && pwd)"

mkdir -p "$HOST_REPO/.datalox" \
         "$HOST_REPO/agent-wiki" \
         "$HOST_REPO/.github" \
         "$HOST_REPO/.cursor/rules" \
         "$HOST_REPO/.windsurf/rules" \
         "$HOST_REPO/skills"

copy_if_missing() {
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  if [ -e "$dest" ]; then
    echo "skip existing: $dest"
    return
  fi
  cp "$src" "$dest"
  echo "copied: $dest"
}

copy_tree_if_missing() {
  local src_dir="$1"
  local dest_dir="$2"
  mkdir -p "$dest_dir"
  find "$src_dir" -mindepth 1 -maxdepth 1 | while read -r src; do
    local name
    name="$(basename "$src")"
    if [ -e "$dest_dir/$name" ]; then
      echo "skip existing: $dest_dir/$name"
      continue
    fi
    cp -R "$src" "$dest_dir/$name"
    echo "copied: $dest_dir/$name"
  done
}

copy_if_missing "$PACK_ROOT/DATALOX.md" "$HOST_REPO/DATALOX.md"
copy_if_missing "$PACK_ROOT/AGENTS.md" "$HOST_REPO/AGENTS.md"
copy_if_missing "$PACK_ROOT/CLAUDE.md" "$HOST_REPO/CLAUDE.md"
copy_if_missing "$PACK_ROOT/WIKI.md" "$HOST_REPO/WIKI.md"
copy_if_missing "$PACK_ROOT/GEMINI.md" "$HOST_REPO/GEMINI.md"
copy_if_missing "$PACK_ROOT/START_HERE.md" "$HOST_REPO/START_HERE.md"
copy_if_missing "$PACK_ROOT/.github/copilot-instructions.md" "$HOST_REPO/.github/copilot-instructions.md"
copy_if_missing "$PACK_ROOT/.cursor/rules/datalox-pack.mdc" "$HOST_REPO/.cursor/rules/datalox-pack.mdc"
copy_if_missing "$PACK_ROOT/.windsurf/rules/datalox-pack.md" "$HOST_REPO/.windsurf/rules/datalox-pack.md"
copy_if_missing "$PACK_ROOT/.datalox/config.json" "$HOST_REPO/.datalox/config.json"
copy_if_missing "$PACK_ROOT/.datalox/config.schema.json" "$HOST_REPO/.datalox/config.schema.json"
copy_if_missing "$PACK_ROOT/.datalox/manifest.json" "$HOST_REPO/.datalox/manifest.json"
copy_if_missing "$PACK_ROOT/agent-wiki/pattern.schema.md" "$HOST_REPO/agent-wiki/pattern.schema.md"

copy_tree_if_missing "$PACK_ROOT/skills" "$HOST_REPO/skills"
copy_tree_if_missing "$PACK_ROOT/agent-wiki/patterns" "$HOST_REPO/agent-wiki/patterns"
copy_tree_if_missing "$PACK_ROOT/agent-wiki/meta" "$HOST_REPO/agent-wiki/meta"

echo
echo "Datalox adopted into host repo:"
echo "  $HOST_REPO"
echo
echo "Next:"
echo "  1. Open the host repo in your agent"
echo "  2. Tell it once: Read DATALOX.md and use the Datalox pack"
echo "  3. Watch agent-wiki/index.md, agent-wiki/log.md, and agent-wiki/lint.md"
