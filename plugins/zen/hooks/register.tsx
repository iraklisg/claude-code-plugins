import { atom, read, update } from 'claude-code'
import type { BuiltinToolResults, Register } from 'claude-code'

import type { Agent, Band, Todo } from '../types'

const isOn = atom({ plugin: 'zen', key: 'isOn' } as const, true)
const isBrief = atom({ plugin: 'zen', key: 'isBrief' } as const, true)
const IDLE: Band = { activity: 'Working', tools: 0, todo: null }
const band = atom({ plugin: 'zen', key: 'band' } as const, IDLE)
const facts = atom({ plugin: 'zen', key: 'facts' } as const, [])
const agents = atom({ plugin: 'zen', key: 'agents' } as const, [])
// Text Claude wrote before a tool call this session; the final answer never lands here.
const chatter = atom({ plugin: 'zen', key: 'chatter' } as const, [])

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
  'Workflow',
  'Skill',
  'Edit',
  'Write',
  'NotebookEdit',
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
  'The user sees a condensed transcript: tool calls and diffs are hidden; failures and your final message are shown.',
  '- No preamble and no narration of steps between tool calls.',
  '- The final message leads with the outcome in one or two sentences. Add detail only when the user needs it to act.',
].join('\n')

type Turn = {
  testsPassed: boolean | null
  tasks: Map<string, { subject: string; activeForm?: string; status: string }>
}

const freshTurn = (): Turn => ({
  testsPassed: null,
  tasks: new Map(),
})

// Their errors are self-corrections (a missing file, a bad pattern) Claude recovers from.
const READ_ONLY = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch'])

// AskUserQuestion's row is hidden once answered; its dialog is a site of its own.
const isQuiet = (tool: string, isErrored: boolean, isInterrupted: boolean, isRunning: boolean) =>
  READ_ONLY.has(tool) ||
  (!isErrored &&
    !isInterrupted &&
    (QUIET.has(tool) || tool === 'Bash' || (tool === 'AskUserQuestion' && !isRunning)))

// `/zen status` and usage replies stay; the footer label already shows a switch.
const SWITCHES = new Set(['', 'on', 'off', 'brevity on', 'brevity off'])

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

const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const factsLine = (turn: Turn) =>
  turn.testsPassed === null ? '' : `◇ tests ${turn.testsPassed ? '✓' : '✗'}`

export const agentsLine = (running: readonly Agent[]) =>
  `◇ ${plural(running.length, 'agent')} running · ${running.map(one => one.description).join(', ')}`

export const bandLine = (state: Band, running: readonly Agent[]) => {
  const agents = running.length > 0 ? ` · ${plural(running.length, 'agent')}` : ''
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
    const brevity = await $.store.get('brevity')
    await update($, isOn, () => stored !== false)
    await update($, isBrief, () => brevity !== false)
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
      await update($, isBrief, () => args === 'brevity on')

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
      // turn.complete drops an agent as it ends; this catches one killed instead.
      const ended = new Set(
        (await $.agent.list())
          .filter(one => ['completed', 'failed', 'killed'].includes(one.status))
          .map(one => one.id),
      )
      await update($, agents, list => list.filter(one => !ended.has(one.id)))
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    const id = spawned.agentId
    if (id !== undefined) {
      await update($, agents, list => [...list, { id, description: e.description }])
    }

    return spawned
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    await update($, band, state => ({
      ...state,
      activity: VERBS[e.tool] ?? 'Working',
      tools: state.tools + 1,
    }))
    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    if (e.tool === 'Bash' && TEST_RUNNER.test(e.command)) {
      turn.testsPassed = ran.isError !== true && !TEST_FAILED.test(ran.text ?? '')
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

  on('turn.step', async function* ($, e, next) {
    const step = yield* next(e)
    const text = squash(step.answer)
    if (e.agentId === undefined && step.toolUses.length > 0 && text !== '') {
      await update($, chatter, list => [...list, text].slice(-200))
    }

    return step
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const agentId = e.agentId
    if (agentId !== undefined) {
      await update($, agents, list => list.filter(one => one.id !== agentId))

      return done
    }

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

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const text = squash(e.props.text)
    const isChatter =
      e.props.isSummary === true ||
      (text !== '' && (await read($, chatter)).some(one => one.includes(text)))
    if (!isChatter) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { tool, isErrored, isInterrupted, isRunning } = e.props
    if (!(await read($, isOn)) || !isQuiet(tool, isErrored, isInterrupted, isRunning)) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const { tool, isErrored } = e.props
    if (!(await read($, isOn)) || !isQuiet(tool, isErrored, false, false)) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const hasTrouble = e.props.calls.some(
      call => !isQuiet(call.tool, call.isErrored, call.isInterrupted, call.isRunning),
    )
    if (e.props.isExpanded || hasTrouble || !(await read($, isOn))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const label = (await read($, isBrief)) ? 'zen · brief' : 'zen'

    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, label] } })
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const { origin, task, from, isExpanded } = e.props
    const isTaskDone =
      origin.kind === 'task-notification' && task?.status !== 'failed' && task?.status !== 'killed'
    const isAgentMessage = from !== undefined && origin.kind === 'unclassified'
    if (isExpanded || !(isTaskDone || isAgentMessage) || !(await read($, isOn))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'CommandOutput', props: { command: 'zen' } }, ($, e, next) => {
    if (e.props.isErrored || !SWITCHES.has(e.props.args.trim().toLowerCase())) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOn))) return next(e)
    const running = await read($, agents)
    if (!e.props.isWorking && running.length === 0) return next(e)
    const line = e.props.isWorking ? bandLine(await read($, band), running) : agentsLine(running)
    const { Text } = $.ui.resolve(e)

    return <Text dimColor wrap="truncate">{line}</Text>
  })
}
