# zen

**A focused Claude Code view for developers: see what matters, skip the noise.**

When Claude works, the transcript fills up with file reads, searches, shell commands, diffs and running commentary. You review changes in your editor or lazygit anyway, so most of that is noise. zen hides it and leaves four things: **the answer**, **what went wrong**, **what's running**, and **whether the tests passed**.

## Before / after

Without zen:

```
❯ fix the failing test
  Read 1 file, ran 2 shell commands
● Let me look at the sum implementation.
● Update(src/sum.ts)
  ⎿  Added 1 line, removed 1 line
      2 -  return values.reduce((total, value) => total + Math.abs(value), 0)
      2 +  return values.reduce((total, value) => total + value, 0)
● Now let me run the tests to confirm.
  Ran 1 shell command
● Fixed: sum() applied Math.abs to each value. All tests pass.
✻ Baked for 18s
```

With zen:

```
❯ fix the failing test
● Fixed: sum() applied Math.abs to each value. All tests pass.
✻ Baked for 18s
◇ tests ✓
```

## What zen hides, and why

| Hidden | Why |
|---|---|
| File reads, searches, web fetches, tool searches | Inputs Claude gathers on its way to the answer, not results |
| Shell commands, MCP calls and any other tool that succeeds | You only need to know when one fails |
| Edits and their diffs | You review changes in your editor or git tool |
| Claude's in-between narration ("Let me check…") | The final answer covers it |
| Skill, agent and workflow launch rows | The live line above the prompt shows what's running |
| Finished-agent notices | Claude relays the result in its next message |
| Errors from reads and searches | Self-corrections (a missing file, a bad pattern) Claude recovers from |
| Answered-question rows | You just picked the answer |

## What zen always shows

- **Claude's final answer**, untouched
- **Failures**: any tool that errored, except reads and searches; a task that failed or was killed
- **Anything that needs you**: permission prompts, Claude's questions and plans to approve
- **Progress while Claude works**, in one line above the prompt: `▰▰▱ 2/3 · Updating routes` · `◇ Reading · 4 tools` · `◇ 2 agents running · …`
- **The test result** when tests ran: `◇ tests ✓` or `◇ tests ✗`. zen reads failure markers in the output, so a piped `pnpm test | tail` that failed still shows ✗
- **The mode**: a dim `zen · brief` label in the prompt footer

## Brevity: shorter answers, not just a cleaner screen

Everything above is display only: Claude does the same work and writes the same words, and zen chooses what to draw. **Brevity** is the one setting that changes what Claude writes. It adds a short rule to Claude's system prompt:

- no preamble and no narration between steps
- the final answer leads with the outcome in one or two sentences, with detail only when you need it to act

| | View (`/zen on`/`off`) | Brevity (`/zen brevity on`/`off`) |
|---|---|---|
| Changes | what's drawn | what Claude writes |
| Tokens | none | ~100 in the system prompt, cached after the first request |
| Default | on | on |
| Footer label | `zen` | adds `· brief` → `zen · brief` |

Brevity usually pays for itself, since shorter answers mean fewer output tokens, but that isn't guaranteed. Turn it off if you want zen to add nothing to the prompt. In an organization-managed Claude Code, plugins can't change the system prompt, so brevity has no effect there; the view still works.

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

Terminal only. Requires a Claude Code build with mod support (written against 2.1.303). Update with `claude plugin update zen@zen`.

## Use

| Command | Effect |
|---|---|
| `/zen` | toggle the view |
| `/zen on` / `/zen off` | set the view |
| `/zen brevity on` / `off` | add or drop the brevity rule |
| `/zen status` | show both settings |

Settings persist across sessions. Nothing is lost: `/zen off` redraws the whole transcript in the default view. ctrl+o doesn't reveal rows zen hides.

## Cost

No extra model calls. Brevity's ~100 tokens are the only prompt cost.

See [DESIGN.md](DESIGN.md) for the decisions behind it.

## Develop

```
claude --plugin-dir .            # run a session with the working copy
claude plugin validate .
claude plugin test .
scripts/run.sh B 'fix the failing test'   # live scenario in an isolated tmux
```
