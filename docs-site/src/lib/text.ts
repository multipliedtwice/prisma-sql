const LEADING_SYMBOLS = /^[\p{Extended_Pictographic}\p{So}✓️‍\s]+/u
const TRAILING_ARROW = /\s*[→›]\s*$/u

export function cleanLabel(text: string): string {
  return String(text).replace(LEADING_SYMBOLS, '').replace(TRAILING_ARROW, '')
}
