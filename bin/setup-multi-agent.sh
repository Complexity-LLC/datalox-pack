#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/skills"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
GRAY='\033[0;37m'
NC='\033[0m'

link_if_missing() {
  local target="$1"
  local dest="$2"
  local label="$3"

  mkdir -p "$(dirname "$dest")"

  if [ -L "$dest" ]; then
    local existing
    existing="$(readlink "$dest")"
    if [ "$existing" = "$target" ]; then
      echo -e "${GRAY}[$label] already linked: $dest${NC}"
      return
    fi
    echo -e "${YELLOW}[$label] existing symlink points elsewhere: $dest -> $existing${NC}"
    return
  fi

  if [ -e "$dest" ]; then
    echo -e "${YELLOW}[$label] path exists and is not a symlink: $dest${NC}"
    return
  fi

  ln -s "$target" "$dest"
  echo -e "${GREEN}[$label] linked: $dest -> $target${NC}"
}

echo "Datalox Pack multi-agent setup"
echo "Repo: $REPO_ROOT"
echo

link_if_missing "$SKILLS_DIR" "$HOME/.codex/skills/datalox-pack" "Codex CLI"
link_if_missing "$SKILLS_DIR" "$HOME/.claude/skills/datalox-pack" "Claude Code"
link_if_missing "$SKILLS_DIR" "$HOME/.opencode/skills/datalox-pack" "OpenCode"
link_if_missing "$SKILLS_DIR" "$HOME/.gemini/skills/datalox-pack" "Gemini CLI"
link_if_missing "$SKILLS_DIR" "$REPO_ROOT/.cursor/skills" "Cursor"
link_if_missing "$SKILLS_DIR" "$REPO_ROOT/.windsurf/skills" "Windsurf"

echo
bash "$REPO_ROOT/bin/install-default-host-integrations.sh"

echo
echo -e "${GREEN}Done.${NC}"
echo "Committed bootstrap files already cover:"
echo "  - AGENTS.md"
echo "  - CLAUDE.md"
echo "  - .claude/settings.json"
echo "  - .claude/hooks/auto-promote.sh"
echo "  - WIKI.md"
echo "  - GEMINI.md"
echo "  - .github/copilot-instructions.md"
echo "  - .cursor/rules/datalox-pack.mdc"
echo "  - .windsurf/rules/datalox-pack.md"
echo "  - ~/.local/bin/codex shim when Codex is installed"
echo "  - ~/.claude/hooks/datalox-auto-promote.sh"
