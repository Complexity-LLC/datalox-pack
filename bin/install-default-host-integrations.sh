#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_ROOT="${HOME}/.datalox/cache"
PACK_CACHE="${CACHE_ROOT}/datalox-pack"
LOCAL_BIN="${HOME}/.local/bin"
CLAUDE_HOME="${HOME}/.claude"
CLAUDE_HOOKS="${CLAUDE_HOME}/hooks"
CLAUDE_SETTINGS="${CLAUDE_HOME}/settings.json"
CODEX_SHIM="${LOCAL_BIN}/codex"

mkdir -p "$CACHE_ROOT" "$LOCAL_BIN" "$CLAUDE_HOOKS"
if [ ! -e "$PACK_CACHE" ]; then
  ln -s "$REPO_ROOT" "$PACK_CACHE"
fi

find_real_codex() {
  if [ -n "${DATALOX_REAL_CODEX_BIN:-}" ] && [ -x "${DATALOX_REAL_CODEX_BIN:-}" ]; then
    printf '%s\n' "$DATALOX_REAL_CODEX_BIN"
    return 0
  fi
  while IFS= read -r candidate; do
    if [ "$candidate" != "$CODEX_SHIM" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done < <(which -a codex 2>/dev/null || true)
  return 1
}

ensure_path_export() {
  local file="$1"
  touch "$file"
  if ! grep -Fq 'export PATH="$HOME/.local/bin:$PATH"' "$file"; then
    printf '\n# Prefer local host shims such as the Datalox Codex wrapper.\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$file"
  fi
}

REAL_CODEX_BIN="$(find_real_codex || true)"
if [ -n "$REAL_CODEX_BIN" ]; then
  cat > "$CODEX_SHIM" <<EOF
#!/usr/bin/env bash
set -euo pipefail

REAL_CODEX_BIN="${REAL_CODEX_BIN}"
PACK_ROOT="${REPO_ROOT}"

resolve_repo() {
  local repo="\$(pwd)"
  local args=("\$@")
  for ((i=0; i<\${#args[@]}; i++)); do
    case "\${args[i]}" in
      -C|--cd)
        if (( i + 1 < \${#args[@]} )); then
          repo="\${args[i+1]}"
        fi
        ;;
    esac
  done
  (cd "\$repo" >/dev/null 2>&1 && pwd) || printf '%s\n' "\$repo"
}

should_wrap() {
  local args=("\$@")
  for arg in "\${args[@]}"; do
    case "\$arg" in
      exec|e|review)
        return 0
        ;;
    esac
  done
  return 1
}

repo="\$(resolve_repo "\$@")"
if should_wrap "\$@"; then
  export DATALOX_CODEX_BIN="\$REAL_CODEX_BIN"
  exec node "\$PACK_ROOT/bin/datalox-codex.js" --repo "\$repo" -- "\$@"
fi

exec "\$REAL_CODEX_BIN" "\$@"
EOF
  chmod +x "$CODEX_SHIM"
fi

cp "$REPO_ROOT/bin/claude-global-auto-promote.sh" "$CLAUDE_HOOKS/datalox-auto-promote.sh"
chmod +x "$CLAUDE_HOOKS/datalox-auto-promote.sh"

CLAUDE_HOOK_PATH="$CLAUDE_HOOKS/datalox-auto-promote.sh" node - "$CLAUDE_SETTINGS" <<'EOF'
const fs = require("node:fs");
const settingsPath = process.argv[2];
const hookPath = process.env.CLAUDE_HOOK_PATH;
let parsed = {};
if (fs.existsSync(settingsPath)) {
  parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
}
parsed.hooks ??= {};
for (const eventName of ["Stop", "SubagentStop"]) {
  parsed.hooks[eventName] ??= [];
  const entries = parsed.hooks[eventName];
  const hasDatalox = entries.some((entry) =>
    Array.isArray(entry?.hooks)
    && entry.hooks.some((hook) =>
      hook?.type === "command" && typeof hook?.command === "string" && hook.command.includes("datalox-auto-promote.sh"))
  );
  if (!hasDatalox) {
    entries.push({
      hooks: [
        {
          type: "command",
          command: hookPath,
          timeout: 60,
        },
      ],
    });
  }
}
fs.writeFileSync(settingsPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
EOF

ensure_path_export "$HOME/.zshrc"
ensure_path_export "$HOME/.zprofile"

echo "Installed default host integrations."
if [ -n "$REAL_CODEX_BIN" ]; then
  echo "  Codex shim: $CODEX_SHIM -> $REAL_CODEX_BIN"
else
  echo "  Codex shim: not installed"
fi
echo "  Claude hook: $CLAUDE_HOOKS/datalox-auto-promote.sh"
echo "  Pack cache: $PACK_CACHE"
