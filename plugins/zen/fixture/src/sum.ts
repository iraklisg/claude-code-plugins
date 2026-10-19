export function sum(...values: number[]): number {
  return values.reduce((total, value) => total + Math.abs(value), 0)
}
