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
CLAUDE_SHIM="${LOCAL_BIN}/claude"
STABLE_BIN_DIRS=("/opt/homebrew/bin" "/usr/local/bin")

mkdir -p "$CACHE_ROOT" "$LOCAL_BIN" "$CLAUDE_HOOKS"

valid_full_pack_root() {
  local candidate="$1"
  [ -f "$candidate/package.json" ] && [ -f "$candidate/scripts/lib/agent-pack.mjs" ]
}

read_install_stamp_pack_root() {
  local install_stamp="$1"
  if [ ! -f "$install_stamp" ]; then
    return 1
  fi
  node -e '
    const fs = require("node:fs");
    try {
      const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (typeof payload?.packRootPath === "string" && payload.packRootPath.length > 0) {
        process.stdout.write(payload.packRootPath);
      } else {
        process.exit(1);
      }
    } catch {
      process.exit(1);
    }
  ' "$install_stamp"
}

resolve_cache_source_root() {
  if valid_full_pack_root "$REPO_ROOT"; then
    printf '%s\n' "$REPO_ROOT"
    return 0
  fi

  local stamped_root
  stamped_root="$(read_install_stamp_pack_root "$REPO_ROOT/.datalox/install.json" 2>/dev/null || true)"
  if [ -n "$stamped_root" ] && valid_full_pack_root "$stamped_root"; then
    printf '%s\n' "$stamped_root"
    return 0
  fi

  if [ -e "$PACK_CACHE" ] && valid_full_pack_root "$PACK_CACHE"; then
    printf '%s\n' "$PACK_CACHE"
    return 0
  fi

  return 1
}

SOURCE_PACK_ROOT="$(resolve_cache_source_root || true)"
if [ -n "$SOURCE_PACK_ROOT" ]; then
  if [ -L "$PACK_CACHE" ] || [ -e "$PACK_CACHE" ]; then
    if ! valid_full_pack_root "$PACK_CACHE"; then
      rm -rf "$PACK_CACHE"
      ln -s "$SOURCE_PACK_ROOT" "$PACK_CACHE"
    fi
  else
    ln -s "$SOURCE_PACK_ROOT" "$PACK_CACHE"
  fi
fi

is_datalox_host_path() {
  local host_name="$1"
  local shim_path="$2"
  local candidate="$3"
  if [ "$candidate" = "$shim_path" ]; then
    return 0
  fi
  for dir in "${STABLE_BIN_DIRS[@]}"; do
    if [ "$candidate" = "${dir}/${host_name}" ]; then
      return 0
    fi
  done
  return 1
}

find_real_binary() {
  local host_name="$1"
  local shim_path="$2"
  local env_override="${3:-}"
  if [ -n "$env_override" ] && [ -x "$env_override" ]; then
    printf '%s\n' "$env_override"
    return 0
  fi
  while IFS= read -r candidate; do
    if is_datalox_host_path "$host_name" "$shim_path" "$candidate"; then
      continue
    fi
    printf '%s\n' "$candidate"
    return 0
  done < <(which -a "$host_name" 2>/dev/null || true)
  return 1
}

install_stable_links() {
  local host_name="$1"
  local shim_path="$2"
  for dir in "${STABLE_BIN_DIRS[@]}"; do
    if [ ! -d "$dir" ] || [ ! -w "$dir" ]; then
      continue
    fi
    local target="${dir}/${host_name}"
    if [ -L "$target" ] && [ "$(readlink "$target")" = "$shim_path" ]; then
      continue
    fi
    if [ -e "$target" ] && [ ! -L "$target" ]; then
      echo "  ${host_name} stable link: skip existing non-symlink $target"
      continue
    fi
    rm -f "$target"
    ln -s "$shim_path" "$target"
    echo "  ${host_name} stable link: $target -> $shim_path"
  done
}

ensure_path_export() {
  local file="$1"
  touch "$file"
  if ! grep -Fq 'export PATH="$HOME/.local/bin:$PATH"' "$file"; then
    printf '\n# Prefer local host shims such as the Datalox Codex wrapper.\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$file"
  fi
}

REAL_CODEX_BIN="$(find_real_binary "codex" "$CODEX_SHIM" "${DATALOX_REAL_CODEX_BIN:-}" || true)"
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
  install_stable_links "codex" "$CODEX_SHIM"
fi

REAL_CLAUDE_BIN="$(find_real_binary "claude" "$CLAUDE_SHIM" "${DATALOX_REAL_CLAUDE_BIN:-}" || true)"
if [ -n "$REAL_CLAUDE_BIN" ]; then
  cat > "$CLAUDE_SHIM" <<EOF
#!/usr/bin/env bash
set -euo pipefail

REAL_CLAUDE_BIN="${REAL_CLAUDE_BIN}"
PACK_ROOT="${REPO_ROOT}"

resolve_repo() {
  local repo="\$(pwd)"
  local args=("\$@")
  for ((i=0; i<\${#args[@]}; i++)); do
    case "\${args[i]}" in
      -C|--cd|--cwd)
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
  if (( \${#args[@]} == 0 )); then
    return 1
  fi
  case "\${args[0]}" in
    mcp|update|config|-h|--help|-v|--version)
      return 1
      ;;
  esac
  for arg in "\${args[@]}"; do
    case "\$arg" in
      -p|--print)
        return 0
        ;;
    esac
  done
  for arg in "\${args[@]}"; do
    case "\$arg" in
      -*)
        ;;
      *)
        return 0
        ;;
    esac
  done
  return 1
}

repo="\$(resolve_repo "\$@")"
if should_wrap "\$@"; then
  export DATALOX_CLAUDE_BIN="\$REAL_CLAUDE_BIN"
  exec node "\$PACK_ROOT/bin/datalox-claude.js" --repo "\$repo" -- "\$@"
fi

exec "\$REAL_CLAUDE_BIN" "\$@"
EOF
  chmod +x "$CLAUDE_SHIM"
  install_stable_links "claude" "$CLAUDE_SHIM"
fi

if [ ! -f "$REPO_ROOT/bin/claude-global-auto-promote.sh" ] && [ -n "$SOURCE_PACK_ROOT" ]; then
  cp "$SOURCE_PACK_ROOT/bin/claude-global-auto-promote.sh" "$CLAUDE_HOOKS/datalox-auto-promote.sh"
else
  cp "$REPO_ROOT/bin/claude-global-auto-promote.sh" "$CLAUDE_HOOKS/datalox-auto-promote.sh"
fi
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
if [ -n "$REAL_CLAUDE_BIN" ]; then
  echo "  Claude shim: $CLAUDE_SHIM -> $REAL_CLAUDE_BIN"
else
  echo "  Claude shim: not installed"
fi
echo "  Claude hook: $CLAUDE_HOOKS/datalox-auto-promote.sh"
echo "  Pack cache: $PACK_CACHE"
