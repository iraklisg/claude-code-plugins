// Bumped on every flip of the switch, so what reads it redraws.
export type Switched = number

declare module 'claude-code' {
  interface PluginState {
    ste: {
      switched: Switched
    }
  }
}
