# zen: design

A Claude Code mod that turns the transcript into a focused, brief view. Principle: brevity. Hide noise; keep diffs, failures, progress, and the answer.

Settled in a grill-me session on 2026-10-19 (mod API: Claude Code 2.1.303).

## Visibility

**Hidden**
- Read / Grep / Glob / WebFetch / WebSearch rows
- Successful Bash (counted in the facts line)
- Tool groups (respect `isExpanded`, so ctrl+o still works)

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
- Facts line beneath it (via `turn.complete` result text), only if the turn edited files or ran commands:
  `◇ 3 files +42 −17 · 2 cmds · tests ✓`
  - Built by the mod from tool events, no side model call.
  - Tests: detected by command name (`pytest`, `vitest`, `jest`, `go test`, `cargo test`, `npm/pnpm test`); ✓/✗ is the exit code of the last test run in the turn. Output not parsed.
- Research-only turns: answer only, no facts line.

## Prose

`prompt.compose` appends a `session`-scope section: no preamble, no step narration, final answer leads with the outcome. Toggleable separately from the visual hiding. No guess-based hiding of intermediate assistant text in v1.

## Controls

- ctrl+o: full detail.
- `/zen`: turns the mod on or off; the setting is persisted in `$.store`.
- The mod never writes settings files.

## Scope

- Terminal only (v1).
- Written fresh; borrows ideas from [clean-view](https://github.com/MehdiChebbi13/clean-view) (MIT).
- Bookkeeping hooks wrapped in `.catch(($, e, next) => next(e))`.

## Success criterion

A tiny TS project committed at `tests/fixture/` with a planted bug and a `getUser` function. Each scenario is run with real Claude via `claude --plugin-dir ~/Code/zen` in an isolated tmux (`tmux -L zentest`, never the default socket), then checked with `capture-pane`.

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

**B. Debug a failing test** ("fix the failing test in sum.test.ts")
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
- ctrl+o reveals everything
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
