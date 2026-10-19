import { atom, read, update } from 'claude-code'
import type { BuiltinToolResults, Register } from 'claude-code'

import type { Band, Todo } from '../types'

const isOn = atom({ plugin: 'zen', key: 'isOn' } as const, true)
const IDLE: Band = { activity: 'Working', tools: 0, agents: 0, todo: null }
const band = atom({ plugin: 'zen', key: 'band' } as const, IDLE)
const facts = atom({ plugin: 'zen', key: 'facts' } as const, [])

// Rows hidden unless they errored. Bash joins them when it succeeds.
const QUIET = new Set([
  'Read',
  'Grep',
  'Glob',
  'LS',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'Agent',
])

const VERBS: Record<string, string> = {
  Read: 'Reading',
  Grep: 'Searching',
  Glob: 'Searching',
  LS: 'Reading',
  Edit: 'Editing',
  Write: 'Editing',
  Bash: 'Running',
  WebFetch: 'Researching',
  WebSearch: 'Researching',
  Agent: 'Delegating',
}

const TEST_RUNNER =
  /\b(pytest|vitest|jest|go test|cargo test|(npm|pnpm|yarn|bun)( run)? test)\b/
// A pipe or `;` hides the runner's exit code, so its summary decides too.
const TEST_FAILED = /\b[1-9]\d* (failed|failing)\b|(^|\s)FAIL(ED)?\b|--- FAIL/m

const BREVITY = [
  '# Brevity (zen)',
  'The user sees a condensed transcript: tool calls are hidden; file diffs, failures and your final message are shown.',
  '- No preamble and no narration of steps between tool calls.',
  '- The final message leads with the outcome in one or two sentences. Add detail only when the user needs it to act.',
].join('\n')

type Patch = ReadonlyArray<{ lines: string[] }>
type Turn = {
  files: Map<string, { added: number; removed: number }>
  cmds: number
  testsPassed: boolean | null
  tasks: Map<string, { subject: string; activeForm?: string; status: string }>
}

const freshTurn = (): Turn => ({
  files: new Map(),
  cmds: 0,
  testsPassed: null,
  tasks: new Map(),
})

const isQuiet = (tool: string, isErrored: boolean, isInterrupted: boolean) =>
  !isErrored && !isInterrupted && (QUIET.has(tool) || tool === 'Bash')

const countPatch = (patch: Patch) => {
  let added = 0
  let removed = 0
  for (const hunk of patch) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) removed += 1
    }
  }

  return { added, removed }
}

const todoOf = (
  items: ReadonlyArray<{ status: string; activeForm?: string; subject?: string; content?: string }>,
): Todo | null => {
  const live = items.filter(item => item.status !== 'deleted')
  if (live.length === 0) return null
  const doing = live.find(item => item.status === 'in_progress')

  return {
    done: live.filter(item => item.status === 'completed').length,
    total: live.length,
    current: doing?.activeForm ?? doing?.subject ?? doing?.content ?? '',
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const factsLine = (turn: Turn) => {
  const parts: string[] = []
  if (turn.files.size > 0) {
    let added = 0
    let removed = 0
    for (const file of turn.files.values()) {
      added += file.added
      removed += file.removed
    }
    parts.push(`${plural(turn.files.size, 'file')} +${added} −${removed}`)
  }
  if (turn.cmds > 0) parts.push(plural(turn.cmds, 'cmd'))
  if (turn.testsPassed !== null) parts.push(`tests ${turn.testsPassed ? '✓' : '✗'}`)

  return parts.length === 0 ? '' : `◇ ${parts.join(' · ')}`
}

export const bandLine = (state: Band) => {
  const agents = state.agents > 0 ? ` · ${plural(state.agents, 'agent')}` : ''
  if (state.todo !== null) {
    const { done, total, current } = state.todo
    const bar = '▰'.repeat(done) + '▱'.repeat(Math.max(0, total - done))

    return `${bar} ${done}/${total}${current ? ` · ${current}` : ''}${agents}`
  }

  return `◇ ${state.activity} · ${plural(state.tools, 'tool')}${agents}`
}

export const register: Register = on => {
  let turn = freshTurn()

  on('session.start', async ($, e, next) => {
    const stored = await $.store.get('isOn')
    await update($, isOn, () => stored !== false)
    await $.command.register({
      name: 'zen',
      description: 'Toggle the zen view (on, off, brevity on, brevity off, status)',
    })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'zen' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()
    const view = await read($, isOn)
    const brevity = (await $.store.get('brevity')) !== false

    if (args === 'brevity on' || args === 'brevity off') {
      await $.store.set('brevity', args === 'brevity on')

      return { text: `brevity rule ${args.slice(8)} (from the next request)` }
    }
    if (args === 'status') {
      return { text: `view ${view ? 'on' : 'off'} · brevity ${brevity ? 'on' : 'off'}` }
    }
    if (args !== '' && args !== 'on' && args !== 'off') {
      return { text: 'use /zen [on|off|status|brevity on|brevity off]' }
    }

    const next = args === '' ? !view : args === 'on'
    await $.store.set('isOn', next)
    await update($, isOn, () => next)

    return { text: `view ${next ? 'on' : 'off'}` }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      turn = freshTurn()
      await update($, band, () => IDLE)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    await update($, band, state => ({
      ...state,
      activity: VERBS[e.tool] ?? 'Working',
      tools: state.tools + 1,
      agents: state.agents + (e.tool === 'Agent' ? 1 : 0),
    }))
    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    if (e.tool === 'Bash') {
      if (ran.isReadOnly !== true) turn.cmds += 1
      if (TEST_RUNNER.test(e.command)) {
        turn.testsPassed = ran.isError !== true && !TEST_FAILED.test(ran.text ?? '')
      }
    } else if (ran.isError !== true && (e.tool === 'Edit' || e.tool === 'Write')) {
      const result = ran.result as BuiltinToolResults['Edit'] | BuiltinToolResults['Write']
      const isNewFile = 'content' in result && result.structuredPatch.length === 0
      const counted = isNewFile
        ? { added: result.content.split('\n').length, removed: 0 }
        : countPatch(result.structuredPatch)
      const prior = turn.files.get(result.filePath) ?? { added: 0, removed: 0 }
      turn.files.set(result.filePath, {
        added: prior.added + counted.added,
        removed: prior.removed + counted.removed,
      })
    } else if (e.tool === 'TodoWrite') {
      const todo = todoOf(e.todos)
      await update($, band, state => ({ ...state, todo }))
    } else if (e.tool === 'TaskCreate' && ran.isError !== true) {
      const created = ran.result as BuiltinToolResults['TaskCreate']
      turn.tasks.set(created.task.id, {
        subject: e.subject,
        activeForm: e.activeForm,
        status: 'pending',
      })
      const todo = todoOf([...turn.tasks.values()])
      await update($, band, state => ({ ...state, todo }))
    } else if (e.tool === 'TaskUpdate' && ran.isError !== true) {
      const prior = turn.tasks.get(e.taskId) ?? { subject: e.subject ?? '', status: 'pending' }
      turn.tasks.set(e.taskId, {
        subject: e.subject ?? prior.subject,
        activeForm: e.activeForm ?? prior.activeForm,
        status: e.status ?? prior.status,
      })
      const todo = todoOf([...turn.tasks.values()])
      await update($, band, state => ({ ...state, todo }))
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done

    await update($, band, () => IDLE)
    const line = e.reason === 'answer' ? factsLine(turn) : ''
    if (line !== '') {
      await update($, facts, list => [...list, { durationMs: e.durationMs, line }].slice(-50))
    }

    return done
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const ended = await next(e)
    if (!(await read($, isOn))) return ended
    const match = (await read($, facts)).find(
      one => Math.abs(one.durationMs - e.props.durationMs) < 1000,
    )
    if (match === undefined) return ended
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {ended}
        <Text dimColor>{match.line}</Text>
      </Box>
    )
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if ((await $.store.get('brevity')) === false) return composed

    return {
      sections: [...composed.sections, { id: 'zen:brevity', text: BREVITY, scope: 'session' }],
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { tool, isErrored, isInterrupted } = e.props
    if (!(await read($, isOn)) || !isQuiet(tool, isErrored, isInterrupted)) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const { tool, isErrored } = e.props
    if (!(await read($, isOn)) || !isQuiet(tool, isErrored, false)) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const hasTrouble = e.props.calls.some(call => call.isErrored || call.isInterrupted)
    if (e.props.isExpanded || hasTrouble || !(await read($, isOn))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !e.props.isWorking || !(await read($, isOn))) return next(e)
    const state = await read($, band)
    const { Text } = $.ui.resolve(e)

    return <Text dimColor wrap="truncate">{bandLine(state)}</Text>
  })
}
