# zen: design

A Claude Code mod that turns the transcript into a focused, brief view. Principle: brevity. Hide noise; keep failures, progress, the test result and the answer. Diffs are reviewed outside Claude Code (VS Code, lazygit).

**Hard requirement:** zen adds no model calls and nothing slows a turn. The only thing the model reads from zen is the brevity rule (~100 tokens, cached), which has its own off switch.

Settled in a grill-me session on 2026-10-19 (mod API: Claude Code 2.1.303).

## Visibility

**Hidden**
- Every tool row by default, unless it errored or was interrupted: reads, searches, Bash, edits and their diffs (the edit permission dialog still shows its diff: engine-drawn), Skill / Agent / Workflow, MCP calls (`mcp__<server>__<tool>`), and any tool zen doesn't know. A default instead of a list: the list drifted (MCP and ToolSearch slipped through it).
- AskUserQuestion's answered row (the dialog itself stays)
- Errors of read-only tools (Read / Grep / Glob / WebFetch / WebSearch / ToolSearch / MCP resource reads / ListAgents): self-corrections Claude recovers from. An unknown tool's errors show.
- Finished-task notifications (`Agent "…" finished`, `Dynamic workflow "…" completed`) and subagent messages (`Message from @…`): Claude relays them next. Failed or killed tasks stay. ctrl+o (`isExpanded`) shows them.
- `/zen` switch replies (`view off`, `brevity on`): the footer label shows the state. `/zen status` replies stay.
- Tool groups (unless `isExpanded`)

Rows are hidden by zen itself (option a), so ctrl+o cannot reveal them: the `ToolUse` site has no expanded flag and ctrl+o is an engine key. Escape hatch: `/zen off` redraws the whole transcript in the default view. (Option b, hiding only the engine's folded groups so ctrl+o works, was set aside: noisier.)

**Always visible**
- Errors and interruptions of every tool outside the read-only list: the engine's own row and error output
- ExitPlanMode (the plan to approve), EndConversation, AskUserQuestion while it waits
- Permission prompts (engine-drawn; the mod can't hide them anyway), AskUserQuestion

## Live band (`AbovePrompt`, while working)

One line. Progress has priority:
- Todo list exists (TodoWrite / TaskCreate / TaskUpdate, main agent only): `▰▰▱ 2/3 · <current step>`
- Otherwise activity: `◇ Editing · 6 tools`
- Subagents appended: `· 2 agents`
- Between turns, while background agents still run: `◇ 2 agents running · Explore auth code paths, Repo conventions research` (the Agent calls' descriptions, cut to width; tracked from `agent.spawn` and each agent's `turn.complete`; gone at zero).
- The engine's `N background agents launched` row can't be hidden: no render site draws it (checked by logging every site during a launch). Each agent's own `Agent` row is hidden, and so is a `Workflow` row; workflow agents raise `agent.spawn` and `turn.complete` like any agent, so the band lists them by their labels. The `Agent/Dynamic workflow … finished` rows stay as the record.

Never forces Claude to plan (no prompt injection for progress). Yields to surveys (`hasSurvey`).

## End of turn

- Claude's final answer, untouched.
- Facts line under the turn's `✻ Worked for 11s` row (`TurnDuration` site, matched by `durationMs`), only if tests ran in the turn: `◇ tests ✓` / `◇ tests ✗`. (`turn.complete` text was tried: the engine prefixes it with every plugin hooking that event.)
  - Built by the mod from tool events, no side model call.
  - File and command counts were dropped: shell edits (`sed -i`) escape them, Claude's answer and git already say what changed, and a count isn't actionable. The test result is kept because it checks Claude's own claim.
  - Tests: detected by command name (`pytest`, `vitest`, `jest`, `go test`, `cargo test`, `npm/pnpm test`); ✓/✗ is the last test run in the turn: failed if it errored or its output shows a failure marker (`N failed`, `FAIL`, `FAILED`, `--- FAIL`). The markers matter because Claude pipes test output, which hides the exit code.
- Turns without tests: answer only.

## Prose

`prompt.compose` appends a `session`-scope section: no preamble, no step narration, final answer leads with the outcome. Toggle: `/zen brevity on|off`. It does not tell Claude to skip listing files (shell edits would go unreported) or to prefer Edit over sed (more calls, slower turns). In-between text is hidden by the view (free, independent of brevity): `turn.step` records each response's text that came with tool calls, and `AssistantMessage` blocks matching a recorded text (or `isSummary`) are hidden. The final answer is never recorded, so it always shows. Nor is text that came with AskUserQuestion or ExitPlanMode: the turn stops there to wait for the user, so no answer follows to cover it (findings before a "which to apply?" question, a draft before "commit?"); after `--resume` nothing is recorded, so old text stays visible.

## Controls

- `/zen [on|off|status|brevity on|brevity off]`: bare `/zen` toggles the view; persisted in `$.store` across sessions.
- Indicator: a dim `zen · brief` (or `zen`) label at the right of the prompt footer (`SessionMode` site); nothing when the view is off. (`$.ui.status` was tried: the engine prefixes it `⚠ zen:` and it takes its own row.)
- The mod never writes settings files.

## Scope

- Terminal only (v1).
- Written fresh; borrows ideas from [clean-view](https://github.com/MehdiChebbi13/clean-view) (MIT).
- Bookkeeping hooks wrapped in `.catch(($, e, next) => next(e))`.

## Success criterion

A tiny TS project committed at `fixture/` (its tests named `*.spec.ts` so `claude plugin test` ignores them) with a planted bug and a `getUser` function. Each scenario is run with real Claude via `scripts/run.sh <name> '<prompt>'`: a fresh fixture copy, `claude --plugin-dir` in an isolated tmux (`tmux -L zentest`, never the default socket), checked with `capture-pane`. Runs share the mod's `$.store` with your own `--plugin-dir` sessions: restore `/zen on` and `/zen brevity on` after a run that toggles them.

**A. Refactor across 3 files** ("rename getUser to fetchUser everywhere")
```
> rename getUser to fetchUser everywhere

● Renamed getUser → fetchUser in 4 files. Typecheck passes; sum.spec.ts
  fails as before (unrelated).
✻ Worked for 14s
◇ tests ✗
```
Band while working: `▰▰▱ 2/3 · Update routes` (if todo list) or `◇ Editing · 6 tools`.

**B. Debug a failing test** ("fix the failing test")
```
> fix the failing test

● Fixed: sum() applied Math.abs to inputs. All tests pass.
✻ Baked for 18s
◇ tests ✓
```

**C. Research question** ("how does the auth middleware work?")
```
> how does the auth middleware work?

(answer only)
```
Band while working: `◇ Reading · 7 tools`.

**Pass:** in every scenario
- no hidden-type rows are visible
- the facts line is present or absent as specified
- `/zen` off restores the default view
- the user signs off

## Distribution

1. Develop in `~/Code/zen`, loaded via `claude --plugin-dir ~/Code/zen`.
2. After the success criterion passes: push to public `iraklisg/zen`, which doubles as its own marketplace (`.claude-plugin/marketplace.json`, one entry, `"source": "./"`).
3. Dotfiles (`~/.dotfiles/.claude/settings.json`) get only:
   ```json
   "enabledPlugins": { "zen@zen": true },
   "extraKnownMarketplaces": {
     "zen": { "source": { "source": "github", "repo": "iraklisg/zen" } }
   }
   ```
4. Plugin files must not be symlinks (no stow).

## Settled after real use

- Diffs hidden (Q27); this resolved the deferred `Update(path)` header and diff-cap questions.
- The turn's `✻ … for 11s` line stays: it marks where a turn ends and carries the test result (Q33).
