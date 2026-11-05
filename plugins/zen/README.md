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
| Claude's in-between narration ("Let me check…") and its summary rows | The final answer covers it. What Claude wrote with a question or a plan to approve stays, summary rows included: no answer follows it |
| Skill, agent and workflow launch rows | The live line above the prompt shows what's running |
| Finished-agent notices | Claude relays the result in its next message |
| Errors from reads and searches | Self-corrections (a missing file, a bad pattern) Claude recovers from |
| Answered-question rows | You just picked the answer |

## What zen always shows

- **Claude's final answer**, untouched
- **Failures**: any tool that errored, except reads and searches; a task that failed or was killed
- **Anything that needs you**: permission prompts, Claude's questions and plans to approve
- **Progress while Claude works**, in one line above the prompt: `▰▰▱ 2/3 · Updating routes` · `◇ Reading · 4 tools` · `◇ 2 agents running · …`. Rows other plugins draw there (devtools-lens's pages) stay, above it
- **The test result** when tests ran: `◇ tests ✓` or `◇ tests ✗`. zen reads failure markers in the output, so a piped `pnpm test | tail` that failed still shows ✗
- **The mode**: a dim `zen` label in the prompt footer. Click it to toggle the view. Other plugins' labels (ste's) share the footer

## What Claude reads

The view is display only: Claude does the same work and zen chooses what to draw. One thing reaches Claude: while the view is on, a short rule (~100 tokens, cached after the first request) tells it what the view hides:

- no preamble and no narration between steps, since that text is hidden
- answer your question in visible text before asking one back (thinking is hidden, and options aren't an answer)

zen no longer asks for shorter answers. Its brevity rule (0.3.x) cut answers by 23% with no CLAUDE.md, but a CLAUDE.md that asks for short answers already halves them. For a writing style, see [ste](../ste).

## Install

At the prompt of a terminal session:

```
/plugin install zen --marketplace iraklisg/claude-code-plugins
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install zen --marketplace iraklisg/claude-code-plugins
```

Terminal only. Requires a Claude Code build with mod support (written against 2.1.303). Update with `claude plugin update zen@iraklisg`.

## Use

| Command | Effect |
|---|---|
| `/zen` | toggle the view |
| `/zen on` / `/zen off` | set the view |
| `/zen status` | show the setting |

The setting persists across sessions. Nothing is lost: `/zen off` redraws the whole transcript in the default view. ctrl+o doesn't reveal rows zen hides.

## Cost

No extra model calls. The view's ~100-token rule is the only prompt cost.

See [DESIGN.md](DESIGN.md) for the decisions behind it.

## Develop

```
claude --plugin-dir .            # run a session with the working copy
claude plugin validate .
claude plugin test .
scripts/run.sh B 'fix the failing test'   # live scenario in an isolated tmux
```
