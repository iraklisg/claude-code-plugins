# ste

![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Firaklisg%2Fclaude-code-plugins%2Fmain%2Fplugins%2Fste%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version)

Turn Claude's chat replies into pragmatic ASD-STE100, Simplified Technical English: the controlled language of aircraft maintenance manuals, applied "80% of the way". One switch, on the fly, kept across sessions.

```
❯ how do I rotate my SSH key without locking myself out?
● Add the new key before you remove the old key. Keep your current session open until you test the new key.
  1. Make a new key pair on your local machine: …
```

## What Claude is told

While ste is on, a rule of about 260 tokens joins the system prompt (cached after the first request):

- one idea per sentence; max 20 words for instructions, 25 for descriptions; max 6 sentences per paragraph
- active voice, imperative for instructions, simple tenses
- common words with one meaning, the same term for the same thing
- keep articles and small words: no dropping words to shorten a sentence
- no phrasal verbs, contractions, Latin abbreviations or semicolons; noun clusters of 3 words max
- warnings and conditions before the instruction they apply to
- the answer or recommendation in the first sentence; preconditions and risks before the first step
- conditions first ("If X, do Y"); no sentence that repeats or summarizes
- no title or headings in short answers, light markdown
- chat only: code, commands, comments, commits and files keep their normal style

No document skeleton (title, sections, WARNING lines) and no strict mode: both fight short chat answers.

## Use

| Command | Effect |
|---|---|
| `/ste` | toggle |
| `/ste on` / `/ste off` | set |
| `/ste status` | show the setting |

Or click `ste` / `ste off` in the prompt footer. Off by default. The setting persists across sessions and `/clear`, for every project. A switch applies from the next request: earlier answers stay as written.

## What to expect

Measured on Opus 5.5 (`claude -p --safe-mode`, 6 chat prompts × 3 runs, scored with a heuristic STE linter):

- Long sentences, passive voice and common unapproved words drop to zero.
- The structure lines (answer first, risks first, no repeats) halved filler sentences and moved risks to the top of procedures. In blind picks they beat the rule without them, and a stricter "90%" rule ([round 2](#round-2-guardrails-and-a-stricter-rule)).
- A word list (~120 unapproved words and their replacements) in the rule added nothing: Claude already avoided them. ste ships without it.
- **Answers are not shorter.** STE puts back the articles and subjects that terse writing drops and splits long sentences. With a CLAUDE.md that asks for short answers, STE answers were 17% longer (+38% on a debugging how-to, −5% on a recommendation). Without one, 8% shorter.

### Round 2: guardrails and a stricter rule

Opus 5.5 with a terse CLAUDE.md, 8 prompts × 3 runs, scored by a blind Opus judge:

| Rule | Words | Clarity (1–5) | Filler sentences | Late warnings | -ing forms |
|---|---|---|---|---|---|
| none | 253 | 4.2 | 0.8 | 1.1 | 4.7 |
| 80% (0.1.0) | 271 | 4.7 | 0.8 | 1.0 | 1.3 |
| **80% + guardrails (0.2.0)** | 268 | 4.9 | 0.4 | 0.8 | 0.9 |
| 90% | 265 | 4.9 | 0.8 | 0.8 | 0.3 |
| 90% + guardrails | 270 | 4.9 | 0.3 | 0.7 | 0.7 |

The 90% rule asked for approved STE words, only simple tenses and one instruction per sentence. It mostly removed -ing forms and read no better. The "If X, do Y" line barely moved conditions that come after their instruction. No variant made answers shorter.

### With a CLAUDE.md that asks for terse answers

A rule like "sacrifice grammar for concision" contradicts STE, and a CLAUDE.md outranks a plugin's rule, so expect a blend of both. Make it conditional, for example:

> Keep responses brief: no filler, short sentences. Drop grammar for concision only when STE mode is off; when it is on, follow its grammar.

The rule's first line says "STE mode is on", so Claude can tell. Measured: with that line, articles per 100 words went from 6.4 (STE off) to 10 (on), as STE asks.

### With zen

They work together: zen hides tool noise, ste shapes the answers left. Both switches share the footer (`zen · ste`).

## Install

At the prompt of a terminal session:

```
/plugin install ste --marketplace iraklisg/claude-code-plugins
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install ste --marketplace iraklisg/claude-code-plugins
```

Update with `claude plugin update ste@iraklisg`.

Terminal and desktop. Requires a Claude Code build with mod support. In an organization-managed Claude Code, plugins can't change the system prompt, so ste has no effect there.

## Cost

No extra model calls. About 260 tokens of system prompt while on; nothing while off. Each flip costs one prompt-cache miss.
