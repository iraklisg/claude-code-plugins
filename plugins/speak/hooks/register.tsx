import { atom, read, update } from 'claude-code'
import type { CoreEngineInterface, Register } from 'claude-code'

// The mode lives in $.store, which outlives the session and /clear. Bumped on
// every change, so the footer redraws.
const switched = atom({ plugin: 'speak', key: 'switched' } as const, 0)

export const MODES = ['off', 'ste', 'caveman'] as const
type Mode = (typeof MODES)[number]

const isMode = (value: unknown): value is Mode => MODES.includes(value as Mode)

type Settings = Pick<CoreEngineInterface, 'state' | 'store'>
const modeOf = async ($: Settings): Promise<Mode> => {
  await read($, switched)
  const stored = await $.store.get('mode')

  return isMode(stored) ? stored : 'off'
}
const choose = async ($: Settings, mode: Mode) => {
  await $.store.set('mode', mode)
  await update($, switched, n => n + 1)
}

// How much to say, as opposed to how to write it. Sent with every mode but off:
// without it, STE answers were 18% longer than with the old terse CLAUDE.md.
export const BASE = [
  '# Reply scope (speak)',
  '- YOU MUST keep replies focused, brief and concise: no filler, no preamble.',
  '- Give a high-level summary unless the user asks for an in-depth explanation.',
  '- Keep disclaimers and caveats short. Spend most of the reply on the main answer.',
].join('\n')

// Pragmatic ("80%") STE: sentence rules only, no document skeleton, plus four
// structure guardrails (answer first, risks first, no filler) that won blind
// tests against a 90% variant.
export const STE = [
  '# ASD-STE100 mode (speak)',
  'Write chat replies in pragmatic ASD-STE100 (Simplified Technical English), about 80% strict:',
  '- One idea per sentence. Max 20 words for instructions, 25 for descriptions. Max 6 sentences per paragraph.',
  '- Active voice. Imperative for instructions. Simple present, past or future tense.',
  '- Use common words that have one meaning, in their usual part of speech. Use the same term for the same thing every time.',
  '- Keep articles (the, a) and other small words. Do not drop words to make a sentence shorter.',
  '- No phrasal verbs (set up -> install), no contractions, no Latin abbreviations (e.g., i.e., etc.), no semicolons.',
  '- Noun clusters of 3 words max.',
  '- Put warnings and conditions before the instruction they apply to.',
  '- Start with the answer or the recommendation in the first sentence.',
  '- Before the first step, state each precondition or risk.',
  '- Write a condition before its instruction: "If X, do Y", not "Do Y if X".',
  '- Each sentence must give new information. Do not repeat or summarize.',
  '- No title or headings in short answers. Use only light markdown.',
  '- Code, commands, paths and identifiers stay as they are. These rules apply to chat only, not to code, comments, commits or files.',
].join('\n')

// The caveman skill's rules (no persistence section: the mode already applies
// to every request) plus Matt Pocock's "sacrifice grammar" line. Negations,
// numbers and warnings stay whole: a dropped word there flips the meaning.
export const CAVEMAN = [
  '# Caveman mode (speak)',
  'Write chat replies like a smart caveman: all technical substance stays, only fluff goes. Be extremely concise. Sacrifice grammar for the sake of concision.',
  '- Drop articles (a, an, the), filler (just, really, basically, actually, simply), pleasantries (sure, certainly, happy to) and hedging.',
  '- Fragments are fine. Strip conjunctions. Short synonyms (big, not extensive; fix, not "implement a solution for"). One word when one word is enough.',
  '- Abbreviate common terms (DB, auth, config, req, res, fn, impl). Arrows for causality (X -> Y).',
  '- Pattern: `[thing] [action] [reason]. [next step].`',
  '- Technical terms exact. Errors quoted exactly. Negations, numbers and warnings stay complete.',
  '- Write full sentences for security warnings, confirmations of irreversible actions, multi-step sequences where fragment order could be misread, and when the user asks to clarify or repeats a question. Resume caveman after.',
  '- Examples:',
  '  - "Why does the React component re-render?" -> "Inline obj prop -> new ref -> re-render. `useMemo`."',
  '  - Not "Sure! I\'d be happy to help. The issue is likely caused by..." but "Bug in auth middleware. Token expiry check use `<` not `<=`. Fix:"',
  '- Code, commands, paths and identifiers stay as they are. These rules apply to chat only, not to code, comments, commits or files.',
].join('\n')

const RULES: Record<Exclude<Mode, 'off'>, string> = { ste: STE, caveman: CAVEMAN }

// Whether a drawing shows nothing: the engine's footer with no modes.
const isBlank = (node: unknown): boolean => {
  if (node == null || node === false || node === '') return true
  if (Array.isArray(node)) return node.every(isBlank)
  if (typeof node !== 'object' || !('type' in node) || node.type === 'Button') return false

  return isBlank((node as { children?: unknown }).children)
}

const USAGE = `use /speak [${MODES.join('|')}|status]`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'speak', description: `Set how Claude writes replies (${MODES.join(', ')}, status)` })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'speak' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()

    if (args === '' || args === 'status') return { text: `speak ${await modeOf($)}` }
    if (!isMode(args)) return { text: USAGE }

    await choose($, args)

    return { text: `speak ${args} (from the next request)` }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const mode = await modeOf($)
    if (mode === 'off') return composed

    return {
      sections: [
        ...composed.sections,
        { id: 'speak:base', text: BASE, scope: 'session' },
        { id: `speak:${mode}`, text: RULES[mode], scope: 'session' },
      ],
    }
  }).catch(($, e, next) => next(e))

  // Always drawn, so a click can leave off. Goes after what `next(e)` drew:
  // the engine's modes and other plugins' labels (zen's) share this footer.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const mode = await modeOf($)
    const after = MODES[(MODES.indexOf(mode) + 1) % MODES.length] ?? 'off'
    const { Box, Text, Button } = $.ui.resolve(e)
    const below = await next(e)

    return (
      <Box flexDirection="row">
        {isBlank(below) ? null : below}
        {isBlank(below) ? null : <Text dimColor> · </Text>}
        <Button key="speak" plain dimColor onPress={() => choose($, after)}>
          {`speak ${mode}`}
        </Button>
      </Box>
    )
  })
}
