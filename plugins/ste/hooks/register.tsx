import { atom, read, update } from 'claude-code'
import type { CoreEngineInterface, Register } from 'claude-code'

// The switch lives in $.store, which outlives the session and /clear. Bumped on
// every flip, so the footer redraws.
const switched = atom({ plugin: 'ste', key: 'switched' } as const, 0)

type Settings = Pick<CoreEngineInterface, 'state' | 'store'>
const steOn = async ($: Settings) => {
  await read($, switched)

  return (await $.store.get('isOn')) === true
}
const flip = async ($: Settings, value: boolean) => {
  await $.store.set('isOn', value)
  await update($, switched, n => n + 1)
}

// Pragmatic ("80%") STE: sentence rules only, no document skeleton. The first
// line is what a CLAUDE.md can name ("when STE mode is on").
export const RULE = [
  '# ASD-STE100 mode (ste)',
  'STE mode is on. Write chat replies in pragmatic ASD-STE100 (Simplified Technical English), about 80% strict:',
  '- One idea per sentence. Max 20 words for instructions, 25 for descriptions. Max 6 sentences per paragraph.',
  '- Active voice. Imperative for instructions. Simple present, past or future tense.',
  '- Use common words that have one meaning, in their usual part of speech. Use the same term for the same thing every time.',
  '- Keep articles (the, a) and other small words. Do not drop words to make a sentence shorter.',
  '- No phrasal verbs (set up -> install), no contractions, no Latin abbreviations (e.g., i.e., etc.), no semicolons.',
  '- Noun clusters of 3 words max.',
  '- Put warnings and conditions before the instruction they apply to.',
  '- No title or headings in short answers. Use only light markdown.',
  '- Code, commands, paths and identifiers stay as they are. These rules apply to chat only, not to code, comments, commits or files.',
].join('\n')

// Whether a drawing shows nothing: the engine's footer with no modes.
const isBlank = (node: unknown): boolean => {
  if (node == null || node === false || node === '') return true
  if (Array.isArray(node)) return node.every(isBlank)
  if (typeof node !== 'object' || !('type' in node) || node.type === 'Button') return false

  return isBlank((node as { children?: unknown }).children)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ste', description: 'Toggle ASD-STE100 replies (on, off, status)' })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'ste' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()
    const isOn = await steOn($)

    if (args === 'status') return { text: `ste ${isOn ? 'on' : 'off'}` }
    if (args !== '' && args !== 'on' && args !== 'off') return { text: 'use /ste [on|off|status]' }

    const next = args === '' ? !isOn : args === 'on'
    await flip($, next)

    return { text: `ste ${next ? 'on' : 'off'} (from the next request)` }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await steOn($))) return composed

    return { sections: [...composed.sections, { id: 'ste:rule', text: RULE, scope: 'session' }] }
  }).catch(($, e, next) => next(e))

  // Always drawn, so a click turns it back on. Goes after what `next(e)` drew:
  // the engine's modes and other plugins' labels (zen's) share this footer.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const isOn = await steOn($)
    const { Box, Text, Button } = $.ui.resolve(e)
    const below = await next(e)

    return (
      <Box flexDirection="row">
        {isBlank(below) ? null : below}
        {isBlank(below) ? null : <Text dimColor> · </Text>}
        <Button key="ste" plain dimColor onPress={() => flip($, !isOn)}>
          {isOn ? 'ste' : 'ste off'}
        </Button>
      </Box>
    )
  })
}
