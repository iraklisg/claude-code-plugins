# zen: design

A Claude Code mod that turns the transcript into a focused, brief view. Principle: brevity. Hide noise; keep diffs, failures, progress, and the answer.

**Hard requirement:** zen adds no model calls and nothing slows a turn. The only thing the model reads from zen is the brevity rule (~100 tokens, cached), which has its own off switch.

Settled in a grill-me session on 2026-10-19 (mod API: Claude Code 2.1.303).

## Visibility

**Hidden**
- Read / Grep / Glob / WebFetch / WebSearch rows
- Successful Bash (counted in the facts line)
- Tool groups (unless `isExpanded`)

Rows are hidden by zen itself (option a), so ctrl+o cannot reveal them: the `ToolUse` site has no expanded flag and ctrl+o is an engine key. Escape hatch: `/zen off` redraws the whole transcript in the default view. (Option b, hiding only the engine's folded groups so ctrl+o works, was set aside: noisier.)

**Always visible**
- Native Edit/Write diffs, untouched
- Tool errors and interrupted tools
- Failed Bash (non-zero exit): command plus last 5 lines of output
- Permission prompts (engine-drawn; the mod can't hide them anyway), AskUserQuestion

## Live band (`AbovePrompt`, while working)

One line. Progress has priority:
- Todo list exists (TodoWrite / TaskCreate / TaskUpdate, main agent only): `▰▰▱ 2/3 · <current step>`
- Otherwise activity: `◇ Editing · 6 tools`
- Subagents / background tasks appended: `· 2 agents`

Never forces Claude to plan (no prompt injection for progress). Yields to surveys (`hasSurvey`).

## End of turn

- Claude's final answer, untouched.
- Facts line under the turn's `✻ Worked for 11s` row (`TurnDuration` site, matched by `durationMs`), only if the turn edited files or ran non-read-only commands. (`turn.complete` text was tried: the engine prefixes it with every plugin hooking that event.)
  `◇ 3 files +42 −17 · 2 cmds · tests ✓`
  - Built by the mod from tool events, no side model call.
  - Tests: detected by command name (`pytest`, `vitest`, `jest`, `go test`, `cargo test`, `npm/pnpm test`); ✓/✗ is the last test run in the turn: failed if it errored or its output shows a failure marker (`N failed`, `FAIL`, `FAILED`, `--- FAIL`). The markers matter because Claude pipes test output, which hides the exit code.
  - Files count Edit/Write only. Edits made through the shell (`sed -i`) show no diffs and aren't counted; Claude names those files in its answer.
- Research-only turns: answer only, no facts line.

## Prose

`prompt.compose` appends a `session`-scope section: no preamble, no step narration, final answer leads with the outcome. Toggle: `/zen brevity on|off`. It does not tell Claude to skip listing files (shell edits would go unreported) or to prefer Edit over sed (more calls, slower turns). In-between text is hidden by the view (free, independent of brevity): `turn.step` records each response's text that came with tool calls, and `AssistantMessage` blocks matching a recorded text (or `isSummary`) are hidden. The final answer is never recorded, so it always shows; after `--resume` nothing is recorded, so old text stays visible.

## Controls

- ctrl+o: full detail.
- `/zen [on|off|status|brevity on|brevity off]`: bare `/zen` toggles the view; persisted in `$.store` across sessions.
- Indicator: a dim `zen · brief` (or `zen`) label at the right of the prompt footer (`SessionMode` site); nothing when the view is off. (`$.ui.status` was tried: the engine prefixes it `⚠ zen:` and it takes its own row.)
- The mod never writes settings files.

## Scope

- Terminal only (v1).
- Written fresh; borrows ideas from [clean-view](https://github.com/MehdiChebbi13/clean-view) (MIT).
- Bookkeeping hooks wrapped in `.catch(($, e, next) => next(e))`.

## Success criterion

A tiny TS project committed at `fixture/` (its tests named `*.spec.ts` so `claude plugin test` ignores them) with a planted bug and a `getUser` function. Each scenario is run with real Claude via `claude --plugin-dir ~/Code/zen` in an isolated tmux (`tmux -L zentest`, never the default socket), then checked with `capture-pane`.

**A. Refactor across 3 files** ("rename getUser to fetchUser everywhere")
```
> rename getUser to fetchUser everywhere

● Update(src/api.ts)
  ⎿  Updated src/api.ts with 1 addition and 1 removal
     (native diff)
● Update(src/routes.ts)
  ⎿  (native diff)
● Update(src/user.test.ts)
  ⎿  (native diff)

Renamed getUser → fetchUser in 3 files. Typecheck passes.

◇ 3 files +3 −3 · 1 cmd
```
Band while working: `▰▰▱ 2/3 · Update routes` (if todo list) or `◇ Editing · 6 tools`.

**B. Debug a failing test** ("fix the failing test")
```
> fix the failing test in sum.test.ts

● Bash(pnpm vitest run)
  ⎿  FAIL sum.test.ts > adds negatives
     expected -3, received 3
     (last 5 lines only)
● Update(src/sum.ts)
  ⎿  (native diff)

Fixed: sum() applied Math.abs to inputs. Test passes.

◇ 1 file +1 −1 · 2 cmds · tests ✓
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

## Deferred (decide after test runs)

- Hide the `Update(path)` header rows, or keep them?
- Cap long diffs (e.g. 8 lines + `… +N lines`)?
