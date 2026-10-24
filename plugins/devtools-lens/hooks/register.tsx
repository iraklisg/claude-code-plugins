import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Headless, Page, Visit } from '../types'

const pages = atom({ plugin: 'devtools-lens', key: 'pages' } as const, [], {
  shape: 'pages-1',
})
// Last viewport set per page id, from resize_page / emulate.
const viewports = atom({ plugin: 'devtools-lens', key: 'viewports' } as const, {}, {
  shape: 'viewports-1',
})
// Every page the browser had selected this session, by normalized URL.
const visits = atom({ plugin: 'devtools-lens', key: 'visits' } as const, {}, {
  shape: 'visits-3',
})
// The visited pages the model's last reply named by URL: the ones meant for
// the person. The next prompt clears them.
const pins = atom({ plugin: 'devtools-lens', key: 'pins' } as const, [], {
  shape: 'pins-3',
})
const headless = atom({ plugin: 'devtools-lens', key: 'headless' } as const, 'unknown')
// Whether the browser was used since the person's last prompt: the current
// page shows only then.
const usedThisTurn = atom({ plugin: 'devtools-lens', key: 'usedThisTurn' } as const, false)

// Any MCP server named chrome-devtools, however it is installed.
const TOOL = /^mcp__.*chrome-devtools.*__(\w+)$/
const RECHECK_MS = 5 * 60 * 1000
const MAX_PINS = 5
// Nerd Font glyphs: nf-fa-chrome, nf-fa-user_secret, nf-fa-mobile,
// nf-fa-tablet, nf-fa-desktop.
const CHROME = ''
const INCOGNITO = ''
const PHONE = ''
const TABLET = ''
const DESKTOP = ''
const TITLE_CHARS = 48

const HEADLESS_SECTION = {
  id: 'devtools-lens:headless',
  scope: 'session',
  text: [
    'The chrome-devtools browser runs headless: the person cannot see it, and no tab or window opens on their screen.',
    'Never say a page is open for them or ask them to look at it there. To show them a page, write its full URL in your reply: devtools-lens pins every visited page your reply names above their prompt, so name only the pages they should look at.',
    'A page in an isolatedContext has its own cookies: a login done there is not theirs.',
  ].join(' '),
} as const

// "## Pages" lines: `2: Title (http://x/) [selected] isolatedContext=name`
// or a bare `1: about:blank [selected]`.
function parsePages(text: string): Page[] | null {
  const block = text.split('## Pages\n')[1]
  if (block === undefined) return null
  const list: Page[] = []
  for (const line of block.split('\n')) {
    const match = line.match(/^(\d+): (.*?)( \[selected\])?(?: isolatedContext=(\S+))?$/)
    if (!match) break
    const [, id = '', body = '', selected, context] = match
    const open = body.lastIndexOf(' (')
    const hasTitle = open > 0 && body.endsWith(')')
    list.push({
      id,
      title: hasTitle ? body.slice(0, open) : '',
      url: hasTitle ? body.slice(open + 2, -1) : body,
      isSelected: selected !== undefined,
      context: context ?? null,
    })
  }
  return list
}

function viewportOf(input: Record<string, unknown>): string | null {
  if (typeof input.width === 'number' && typeof input.height === 'number') {
    return `${input.width}×${input.height}`
  }
  if (typeof input.viewport === 'string') {
    const [size = ''] = input.viewport.split(',')
    const [w, hgt] = size.split('x')
    return `${w}×${hgt}`
  }
  return null
}

// One spelling per page: decoded, without the fragment or a trailing slash.
function normalize(url: string): string {
  let decoded = url
  try {
    decoded = decodeURI(url)
  } catch {}
  return decoded.replace(/#.*$/, '').replace(/\/+$/, '')
}

// The URLs a reply names, trailing punctuation and markdown dropped.
function urlsIn(answer: string): string[] {
  const found = answer.match(/https?:\/\/[^\s<>`"'\])]+/g) ?? []
  return found.map(url => url.replace(/[.,;:!?*_]+$/, ''))
}

// Reads the flags of this session's own chrome-devtools-mcp: a descendant of
// the Claude process, the parent of the shell `process.run` starts, so a
// server another session runs does not count. `unknown` where `ps` is
// missing or no server is found.
async function detectHeadless($: EngineInterface): Promise<Headless> {
  const ps = await $.process.run(['sh', '-c', 'echo $PPID; ps -A -o pid=,ppid=,args=']).catch(() => null)
  const [root = '', ...rows] = (ps?.stdout ?? '').split('\n')
  const parents = new Map<string, string>()
  const servers: { pid: string; args: string }[] = []
  for (const row of rows) {
    const [, pid = '', ppid = '', args = ''] = row.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/) ?? []
    parents.set(pid, ppid)
    if (args.includes('chrome-devtools-mcp')) servers.push({ pid, args })
  }
  const isOurs = (pid: string) => {
    for (let at = parents.get(pid); at !== undefined && at !== '1'; at = parents.get(at)) {
      if (at === root.trim()) return true
    }
    return false
  }
  // A server shows as several processes (npm exec, its title, node), not all
  // carrying the flags: judge by those that do.
  const ours = servers.filter(server => isOurs(server.pid)).map(server => server.args)
  if (ours.some(args => /--headless(?!=false)/.test(args))) return 'yes'
  return ours.some(args => / --\w/.test(args)) ? 'no' : 'unknown'
}

// A viewport as its device's glyph and width: "390×844" reads " 390".
function device(size: string): string {
  const width = Number.parseInt(size, 10)
  const glyph = width < 768 ? PHONE : width < 1024 ? TABLET : DESKTOP
  return Number.isNaN(width) ? size : `${glyph} ${width}`
}

const isBlank =(url: string) => url === 'about:blank' || url === ''

// Titles end in the site's name ("Page - Site", "Page | Site"): drop it.
const shorten = (title: string, url: string) => {
  const text = title.replace(/\s+[-|–—]\s+[^-|–—]+$/, '') || url
  return text.length > TITLE_CHARS ? `${text.slice(0, TITLE_CHARS - 1)}…` : text
}

export const register: Register = on => {
  let checkedAt = -Infinity

  on('tool.call', async ($, e, next) => {
    const name = e.tool.match(TOOL)?.[1]
    if (name === undefined) return next(e)

    await update($, usedThisTurn, () => true)

    const now = await $.clock.now()
    if (now - checkedAt > RECHECK_MS) {
      checkedAt = now
      const mode = await detectHeadless($)
      await update($, headless, () => mode)
    }

    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    const input = e as unknown as Record<string, unknown>
    const id = typeof input.pageId === 'number' ? String(input.pageId) : null

    const size = viewportOf(input)
    if (size !== null && id !== null) await update($, viewports, all => ({ ...all, [id]: size }))

    const list = parsePages(ran.text ?? '')
    if (list === null) return ran
    await update($, pages, () => list)

    const selected = list.find(page => page.isSelected)
    if (selected === undefined || isBlank(selected.url)) return ran
    const seenAt = (await read($, viewports))[selected.id]
    await update($, visits, all => {
      const key = normalize(selected.url)
      const known = all[key]?.viewports ?? []
      const sizes = seenAt === undefined || known.includes(seenAt) ? known : [...known, seenAt]
      return { ...all, [key]: { url: selected.url, title: selected.title, viewports: sizes, context: selected.context } }
    })
    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, usedThisTurn, () => false)
    await update($, pins, () => [])
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const seen = await read($, visits)
    const named = urlsIn(e.answer).map(normalize)
    const fresh = [...new Set(named)].flatMap(key => (seen[key] ? [seen[key]] : []))
    await update($, pins, () => fresh.slice(0, MAX_PINS))
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const hasBrowser = e.tools.some(tool => TOOL.test(tool))
    if (!hasBrowser || (await read($, headless)) !== 'yes') return composed
    return { sections: [...composed.sections, HEADLESS_SECTION] }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, pins)
    const current = (await read($, usedThisTurn))
      ? (await read($, pages)).find(page => page.isSelected && !isBlank(page.url))
      : undefined
    if (e.props.hasSurvey || (list.length === 0 && current === undefined)) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const sizes = await read($, viewports)

    // Pins once a reply named pages; until then the page the browser is on.
    const rows: Visit[] = list.length > 0
      ? list
      : [{
          url: current!.url,
          title: current!.title,
          viewports: sizes[current!.id] ? [sizes[current!.id]!] : [],
          context: current!.context,
        }]

    return (
      <Box flexDirection="column">
        {rows.map(visit => (
          <Text>
            {CHROME} {visit.title ? <Text weight="bold">{`${shorten(visit.title, visit.url)}  `}</Text> : ''}
            <Text color="suggestion">{visit.url}</Text>
            <Text dimColor>
              {visit.viewports.map(size => `  ${device(size)}`).join('')}
              {visit.context ? `  ${INCOGNITO}` : ''}
            </Text>
          </Text>
        ))}
      </Box>
    )
  })
}
