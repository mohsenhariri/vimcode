#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"

if [[ -z "$target" ]]; then
  echo "usage: vimium-code-launcher.sh <code|code-insiders> [--vim[=true|1|false|0]] [--vim-port=<port>] [args...]" >&2
  exit 2
fi

shift

script_source="${BASH_SOURCE[0]}"

if command -v readlink >/dev/null 2>&1; then
  script_source="$(readlink -f "$script_source")"
fi

script_dir="$(cd -- "$(dirname -- "$script_source")" && pwd -P)"
port="${VIMIUM_CODE_DEBUG_PORT:-9333}"
enable_vim=false
remote_debugging_present=false
args=()

for argument in "$@"; do
  case "$argument" in
    --vim | --vim=true | --vim=1 | --vim=yes | --vim=on)
      enable_vim=true
      ;;
    --vim=false | --vim=0 | --vim=no | --vim=off)
      enable_vim=false
      ;;
    --vim-port=*)
      enable_vim=true
      port="${argument#--vim-port=}"
      ;;
    --vim-debug-port=*)
      enable_vim=true
      port="${argument#--vim-debug-port=}"
      ;;
    --remote-debugging-port | --remote-debugging-port=*)
      remote_debugging_present=true
      args+=("$argument")
      ;;
    *)
      args+=("$argument")
      ;;
  esac
done

if [[ ! "$port" =~ ^[0-9]+$ ]] || ((port < 1 || port > 65535)); then
  echo "Invalid Vimium debug port: $port" >&2
  exit 2
fi

if [[ "$enable_vim" == true && "$remote_debugging_present" == false ]]; then
  args=("--remote-debugging-port=$port" "${args[@]}")
fi

real_command=""

while IFS= read -r candidate; do
  [[ -z "$candidate" ]] && continue

  candidate_source="$candidate"

  if command -v readlink >/dev/null 2>&1; then
    candidate_source="$(readlink -f "$candidate_source")"
  fi

  candidate_dir="$(cd -- "$(dirname -- "$candidate_source")" 2>/dev/null && pwd -P || true)"

  if [[ "$candidate_dir" != "$script_dir" ]]; then
    real_command="$candidate"
    break
  fi
done < <(type -P -a "$target" 2>/dev/null | awk '!seen[$0]++')

if [[ -z "$real_command" ]]; then
  echo "Could not find real $target on PATH." >&2
  echo "Install VS Code or VS Code Insiders, or call it with its full PATH before this wrapper." >&2
  exit 127
fi

exec "$real_command" "${args[@]}"
