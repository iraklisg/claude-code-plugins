# speak

![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Firaklisg%2Fclaude-code-plugins%2Fmain%2Fplugins%2Fspeak%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version)

Pick how Claude writes its chat replies. There is one mode at a time, you can change it on the fly, and it is kept across sessions:

- **`ste`**: pragmatic ASD-STE100, Simplified Technical English. This is the controlled language of aircraft maintenance manuals, applied "80% of the way". Clear, a little longer.
- **`caveman`**: as short as possible. No articles, fragments, arrows. Grammar is sacrificed for concision.
- **`off`**: Claude Code's own style. Nothing is added to the prompt.

```
❯ how do I rotate my SSH key without locking myself out?

speak ste
● Add the new key before you remove the old key. Keep your current session open until you test the new key.
  1. Make a new key pair on your local machine: …

speak caveman
● Add new key first, test, then remove old. Keep current session open -> fallback if new key fails.
  1. New key: …
```

Replaces the `ste` plugin. Brevity and STE pull in opposite directions: STE puts back the articles and subjects that terse writing drops. So they are modes of one switch, not two plugins.

## What Claude is told

In `ste` and `caveman`, three scope lines are sent first. They decide how much to say, not how to write it:

- focused, brief and concise replies: no filler, no preamble
- a high-level summary unless the user asks for an in-depth explanation
- short disclaimers and caveats, most of the reply on the main answer

They keep STE, which is longer than plain English, from growing further.

**`ste`** (about 280 tokens):

- one idea per sentence; max 20 words for instructions, 25 for descriptions; max 6 sentences per paragraph
- active voice, imperative for instructions, simple tenses
- common words with one meaning, the same term for the same thing
- keep articles and small words: no dropping words to shorten a sentence
- no phrasal verbs, contractions, Latin abbreviations or semicolons; noun clusters of 3 words max
- warnings and conditions before the instruction they apply to
- the answer or recommendation in the first sentence; preconditions and risks before the first step
- conditions first ("If X, do Y"); no sentence that repeats or summarizes
- no title or headings in short answers, light markdown

**`caveman`** (about 330 tokens): the rules of the popular caveman skill plus Matt Pocock's "sacrifice grammar for the sake of concision":

- drop articles, filler, pleasantries and hedging; fragments, short synonyms, common abbreviations, arrows for causality
- the pattern `[thing] [action] [reason]. [next step].`, with two short examples
- technical terms and errors exact; negations, numbers and warnings always complete
- full sentences for security warnings, irreversible actions, multi-step sequences that could be misread, and when the user asks to clarify

Both modes apply to chat only: code, commands, comments, commits and files keep their normal style.

## Use

| Command | Effect |
|---|---|
| `/speak ste` / `/speak caveman` / `/speak off` | set the mode |
| `/speak` or `/speak status` | show the mode |

Or click `speak …` in the prompt footer: each click moves to the next mode (off → ste → caveman → off). Off by default. The mode persists across sessions and `/clear`, for every project. A change applies from the next request: earlier answers stay as written.

## What to expect

Measured on Opus 5.5 (`claude -p --safe-mode`, medium effort, 8 chat prompts × 3 runs, with a CLAUDE.md that has no style rules). A blind Opus judge scored each answer:

| Mode | Words | Articles / 100 words | Clarity (1–5) | Brevity (1–5) | Filler sentences |
|---|---|---|---|---|---|
| `off` | 443 | 8.1 | 4.1 | 3.2 | 1.6 |
| `ste` | 264 | 11.4 | 4.8 | 4.0 | 0.6 |
| `caveman` | 230 | 0.9 | 4.0 | 4.1 | 0.9 |

- Both modes cut about half the words of `off`.
- `ste` is the clearest. It is as long as the `ste` 0.2.0 plugin with a terse CLAUDE.md (268 words).
- `caveman` is only 13% shorter than `ste`: it drops articles and joins words, but says the same things. It reads a little less clearly than `ste`.
- The first scope line ("YOU MUST keep replies focused, brief and concise") matters: without it, `ste` answers were 18% longer. With a softer wording, 11% longer.

From the `ste` plugin, earlier rounds with a terse CLAUDE.md:

- Long sentences, passive voice and common unapproved words drop to zero.
- The structure lines (answer first, risks first, no repeats) halved filler sentences and moved risks to the top of procedures. In blind picks they beat the rule without them, and a stricter "90%" rule.
- A word list (~120 unapproved words and their replacements) in the rule added nothing: Claude already avoided them.

### With a CLAUDE.md

A CLAUDE.md outranks a plugin's rule. If yours says "be brief" or "sacrifice grammar for concision", it fights `ste` and duplicates `caveman`. Move rules about sentence form and reply length out of CLAUDE.md and let the mode decide.

### With zen

They work together: zen hides tool noise, speak shapes the answers left. Both switches share the footer (`zen · speak ste`).

## Install

At the prompt of a terminal session:

```
/plugin install speak --marketplace iraklisg/claude-code-plugins
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install speak --marketplace iraklisg/claude-code-plugins
```

Update with `claude plugin update speak@iraklisg`. If you used `ste`, uninstall it: `claude plugin uninstall ste@iraklisg`. Its setting is not carried over.

Terminal and desktop. Requires a Claude Code build with mod support. In an organization-managed Claude Code, plugins can't change the system prompt, so speak has no effect there.

## Cost

No extra model calls. About 300–400 tokens of system prompt in `ste` or `caveman`; nothing in `off`. Each change costs one prompt-cache miss.
