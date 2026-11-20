#!/usr/bin/env bash
# macOS Bash 3.2 treats an empty argument array as unset under nounset.
set -eo pipefail

target="${1:-}"

if [[ "$target" != code && "$target" != code-insiders ]]; then
  echo "usage: vimium-code-launcher.sh <code|code-insiders> [--vim[=true|1|false|0]] [--vim-port=<port>] [args...]" >&2
  exit 2
fi

shift

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
port="${VIMIUM_CODE_DEBUG_PORT:-9333}"
enable_vim=false
remote_debugging_present=false
args=()

while (( $# )); do
  argument="$1"
  shift
  case "$argument" in
    --)
      args+=("--" "$@")
      break
      ;;
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

if [[ "$enable_vim" == true && "$remote_debugging_present" == false ]]; then
  if [[ ! "$port" =~ ^0*([1-9][0-9]{0,4})$ ]] || (( BASH_REMATCH[1] > 65535 )); then
    echo "Invalid Vimium debug port: $port" >&2
    exit 2
  fi
  args=("--remote-debugging-port=${BASH_REMATCH[1]}" "${args[@]}")
fi

real_command=""

while IFS= read -r candidate; do
  if [[ -n "$candidate" && ! "$candidate" -ef "$script_dir/$target" ]]; then
    real_command="$candidate"
    break
  fi
done < <(type -a -p "$target" 2>/dev/null)

if [[ -z "$real_command" ]]; then
  echo "Could not find real $target on PATH." >&2
  echo "Install VS Code or VS Code Insiders, or call it with its full PATH before this wrapper." >&2
  exit 127
fi

exec "$real_command" "${args[@]}"
