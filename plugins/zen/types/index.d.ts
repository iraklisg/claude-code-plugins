export type Todo = { done: number; total: number; current: string }

export type Band = {
  activity: string
  tools: number
  agents: number
  todo: Todo | null
}

export type Facts = { durationMs: number; line: string }

declare module 'claude-code' {
  interface PluginState {
    zen: { isOn: boolean; band: Band; facts: Facts[]; chatter: string[] }
  }
}
