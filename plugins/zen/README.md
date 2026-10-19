# zen

A Claude Code mod that turns the transcript into a calm, brief view. Tool calls, diffs and Claude's in-between narration are hidden; you see the answer, failures, live progress and the test result.

```
❯ fix the failing test
● Fixed: sum() applied Math.abs to each value, so sum(-1, -2) gave 3. All tests pass.
✻ Baked for 18s
◇ tests ✓
```

While Claude works, one line above the prompt shows progress (`▰▰▱ 2/3 · Updating routes`) or activity (`◇ Reading · 4 tools`), and background agents while they run (`◇ 2 agents running · …`). A dim `zen · brief` label in the prompt footer shows the mode.

Terminal only. Requires a Claude Code build with mod support (written against 2.1.303).

## Install

At the prompt of a terminal session:

```
/plugin install zen --marketplace iraklisg/zen
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install zen --marketplace iraklisg/zen
```

## Use

| Command | Effect |
|---|---|
| `/zen` | toggle the view |
| `/zen on` / `/zen off` | set the view; off redraws the whole transcript in the default view |
| `/zen brevity on` / `off` | add or drop a short system-prompt rule (no preamble, no narration, outcome first) |
| `/zen status` | show both settings |

Settings persist across sessions. ctrl+o does not reveal rows zen hides; use `/zen off`.

## What it hides and keeps

Hidden: Read/Grep/Glob/Web/Skill/Agent/Workflow rows, successful shell commands, Edit/Write rows and their diffs, answered-question rows, finished-task notifications, read-only tool errors, and text Claude writes alongside tool calls.

Kept: Claude's final answer, errors of tools that act (Bash, Edit, Write), failed tasks, permission prompts and questions, and a `◇ tests ✓/✗` line when tests ran.

Cost: no model calls. The brevity rule adds about 100 tokens to the system prompt (cached); `/zen brevity off` removes it.

See [DESIGN.md](DESIGN.md) for the decisions behind it.

## Develop

```
claude --plugin-dir .            # run a session with the working copy
claude plugin validate .
claude plugin test .
scripts/run.sh B 'fix the failing test'   # live scenario in an isolated tmux
```
