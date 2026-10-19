#!/usr/bin/env bash
# usage: scripts/run.sh <name> <prompt>
# Runs one scenario end to end: start, trust the folder, send the prompt,
# approve permission prompts, print the band as it changes, then the screen.
#   A: scripts/run.sh A 'rename getUser to fetchUser everywhere'
#   B: scripts/run.sh B 'fix the failing test'
#   C: scripts/run.sh C 'how does the auth middleware work?'
# Stop the server afterwards: tmux -L zentest kill-server
set -uo pipefail
name=$1; prompt=$2
"$(dirname "$0")/start.sh" "$name"; sleep 5
tmux -L zentest send-keys -t "$name" Down Enter; sleep 6
tmux -L zentest send-keys -t "$name" "$prompt"; sleep 1; tmux -L zentest send-keys -t "$name" Enter
for _ in $(seq 1 60); do
  sleep 4; s=$(tmux -L zentest capture-pane -p -t "$name")
  echo "$s" | grep -E "^(◇|▰|▱)" | tail -1
  if echo "$s" | grep -q "Do you want to proceed"; then tmux -L zentest send-keys -t "$name" 1; continue; fi
  echo "$s" | grep -qE "^✻ .* for [0-9]+s" && break
done
tmux -L zentest capture-pane -p -t "$name" -S -300 | sed '/^\s*$/d'
