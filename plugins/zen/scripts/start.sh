#!/usr/bin/env bash
# usage: scripts/start.sh <name>
# Fresh copy of fixture/ in /tmp/zen-run-<name>, then Claude with this mod in
# an isolated tmux server (-L zentest; never the default socket). Answer the
# folder-trust dialog with: tmux -L zentest send-keys -t <name> Down Enter
# ZEN_DIR overrides the mod folder (e.g. an instrumented copy).
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
name=$1
dir=/tmp/zen-run-$name
rm -rf "$dir"; cp -r "$repo/fixture" "$dir"
cd "$dir" && pnpm install --silent >/dev/null 2>&1 && git init -q && git add -A && git commit -qm init
tmux -L zentest kill-session -t "$name" 2>/dev/null || true
tmux -L zentest new-session -d -s "$name" -x 150 -y 60 -c "$dir" \
  "claude --plugin-dir ${ZEN_DIR:-$repo} --permission-mode acceptEdits --allowedTools 'Bash(pnpm:*)' 'Bash(npx:*)' 'Bash(git:*)'"
