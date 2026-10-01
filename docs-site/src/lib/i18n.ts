import en from '../i18n/en.json'
import { STATUS_META, type ParityRow, type ParityStatus } from './parity-data'

type Dict = Record<string, unknown>

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value)

function mergeInto<T extends object>(target: T, source: unknown): T {
  if (!isDict(source)) return target
  for (const [key, value] of Object.entries(source)) {
    const current: unknown = Reflect.get(target, key)
    if (isDict(current) && isDict(value)) mergeInto(current, value)
    else if (value !== undefined) Reflect.set(target, key, value)
  }
  return target
}

export function localize(dictionary: unknown, locale: string) {
  return { ...mergeInto(structuredClone(en), dictionary), locale }
}

export type Dictionary = ReturnType<typeof localize>

export function fill(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), template)
}

export function formatDate(value: string, locale: string): string {
  return new Date(value).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

interface ParityDictionary {
  status?: Partial<Record<ParityStatus, { label?: string; description?: string }>>
  groups?: Record<string, string>
  notes?: Record<string, string>
  support?: Record<string, string>
}

export function parityText(t: { parityData?: ParityDictionary }) {
  const d = t.parityData ?? {}
  return {
    statusLabel: (s: ParityStatus) => d.status?.[s]?.label ?? STATUS_META[s].label,
    statusDescription: (s: ParityStatus) => d.status?.[s]?.description ?? STATUS_META[s].description,
    group: (group: string) => d.groups?.[group] ?? group,
    note: (row: ParityRow) => d.notes?.[row.feature] ?? row.note,
    support: (value: string) => d.support?.[value] ?? value,
  }
}
