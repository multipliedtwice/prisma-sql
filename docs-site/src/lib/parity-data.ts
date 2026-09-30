export type ParityStatus =
  | 'accelerated'
  | 'partial'
  | 'fallback'
  | 'prisma'
  | 'differs'
  | 'missing'
  | 'extra'
  | 'na'
  | 'unknown'

export type ParityGroup =
  | 'Model methods'
  | 'Query options'
  | 'Filters'
  | 'Ordering'
  | 'Aggregates'
  | 'Client API'
  | 'Result types'

export interface ParityRow {
  group: ParityGroup
  feature: string
  prisma: string
  pg: ParityStatus
  sqlite: ParityStatus
  note: string
  verified: boolean
}

export interface StatusMeta {
  label: string
  description: string
}

export const STATUS_META: Record<ParityStatus, StatusMeta> = {
  accelerated: {
    label: 'Accelerated',
    description: 'Compiled to SQL and run through postgres.js or better-sqlite3.',
  },
  partial: {
    label: 'Partial',
    description: 'Compiled to SQL; some argument shapes fall back to Prisma.',
  },
  fallback: {
    label: 'Falls back',
    description: 'The SQL builder rejects it and Prisma runs the query. Same result, no speedup.',
  },
  prisma: {
    label: 'Runs in Prisma',
    description: 'Not intercepted. Prisma Client runs it as before.',
  },
  differs: {
    label: 'Can differ',
    description: 'Accelerated, but the result can differ from Prisma without an error.',
  },
  missing: {
    label: 'Not available',
    description: 'Prisma supports it; prisma-sql has no equivalent.',
  },
  extra: {
    label: 'prisma-sql only',
    description: 'Added by prisma-sql. Not part of the Prisma Client API.',
  },
  na: {
    label: 'Not in Prisma',
    description: 'Prisma does not support this on that database.',
  },
  unknown: {
    label: 'Not checked',
    description: 'Behavior on this database has not been checked yet.',
  },
}

export const STATUS_ORDER: ParityStatus[] = [
  'accelerated',
  'partial',
  'fallback',
  'prisma',
  'differs',
  'missing',
  'extra',
  'na',
  'unknown',
]

export const GROUP_ORDER: ParityGroup[] = [
  'Model methods',
  'Query options',
  'Filters',
  'Ordering',
  'Aggregates',
  'Client API',
  'Result types',
]

const PG_SQLITE = 'PostgreSQL, SQLite'

export const PARITY_ROWS: ParityRow[] = [
  { group: 'Model methods', feature: 'findMany', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'Compiled to SQL.', verified: true },
  { group: 'Model methods', feature: 'findFirst', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: 'Compiled with LIMIT 1. `cursor` and negative `take` are ignored. `distinct` falls back.', verified: true },
  { group: 'Model methods', feature: 'findUnique', prisma: PG_SQLITE, pg: 'partial', sqlite: 'partial', note: 'Compound unique keys such as `a_b: { a, b }` fall back.', verified: true },
  { group: 'Model methods', feature: 'findUniqueOrThrow, findFirstOrThrow', prisma: PG_SQLITE, pg: 'prisma', sqlite: 'prisma', note: 'Not intercepted.', verified: true },
  { group: 'Model methods', feature: 'count', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: '`select: { _all, field }` is ignored and a number is returned instead of an object. Negative `take` falls back.', verified: true },
  { group: 'Model methods', feature: 'aggregate', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: '`take`, `skip`, `cursor` and `orderBy` are ignored, so totals can differ.', verified: true },
  { group: 'Model methods', feature: 'groupBy', prisma: PG_SQLITE, pg: 'partial', sqlite: 'partial', note: '`by` as a single string falls back. Ordering by an aggregate is expected to fall back (not verified).', verified: true },
  { group: 'Model methods', feature: 'create, createMany, createManyAndReturn', prisma: PG_SQLITE, pg: 'prisma', sqlite: 'prisma', note: 'Writes are not intercepted.', verified: true },
  { group: 'Model methods', feature: 'update, updateMany, updateManyAndReturn', prisma: PG_SQLITE, pg: 'prisma', sqlite: 'prisma', note: 'Writes are not intercepted.', verified: true },
  { group: 'Model methods', feature: 'upsert, delete, deleteMany', prisma: PG_SQLITE, pg: 'prisma', sqlite: 'prisma', note: 'Writes are not intercepted.', verified: true },
  { group: 'Model methods', feature: 'findManyStream, findManyReduceStream', prisma: 'No', pg: 'extra', sqlite: 'missing', note: 'Row streaming. PostgreSQL only; SQLite throws.', verified: true },

  { group: 'Query options', feature: 'select', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'Scalars, relations and `_count`. Unknown fields fall back.', verified: true },
  { group: 'Query options', feature: 'include', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'Queries over the depth, fan-out or circular-include limits fall back.', verified: true },
  { group: 'Query options', feature: 'omit (per query)', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: 'Ignored. Omitted fields are returned.', verified: true },
  { group: 'Query options', feature: 'omit (client option)', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: 'Not read. Fields omitted in `new PrismaClient({ omit })` are returned.', verified: false },
  { group: 'Query options', feature: 'distinct', prisma: PG_SQLITE, pg: 'differs', sqlite: 'partial', note: 'PostgreSQL uses DISTINCT ON; when `orderBy` does not start with the distinct fields, order and `take` can differ (not verified). SQLite with `cursor` falls back.', verified: false },
  { group: 'Query options', feature: 'take, skip', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: '', verified: true },
  { group: 'Query options', feature: 'Negative take', prisma: PG_SQLITE, pg: 'partial', sqlite: 'partial', note: 'Needs `orderBy` on selected scalar fields; otherwise falls back.', verified: true },
  { group: 'Query options', feature: 'cursor', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: 'When the cursor row does not exist, rows are returned; Prisma returns an empty list. Without `orderBy`, row order is not fixed.', verified: true },
  { group: 'Query options', feature: 'relationLoadStrategy', prisma: 'PostgreSQL (preview)', pg: 'accelerated', sqlite: 'na', note: 'Ignored. The prisma-sql planner chooses how relations load.', verified: true },
  { group: 'Query options', feature: '_count in select / include', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'Filtered counts supported. Root `_count: true` may also count to-one relations (not verified).', verified: true },
  { group: 'Query options', feature: 'Nested where, take, skip', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: '', verified: true },
  { group: 'Query options', feature: 'Nested orderBy', prisma: PG_SQLITE, pg: 'partial', sqlite: 'partial', note: 'Scalar fields only. Relation fields fall back.', verified: true },
  { group: 'Query options', feature: 'Nested cursor, distinct', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: 'Applied to one batched child query across all parents, not per parent.', verified: false },

  { group: 'Filters', feature: 'equals, shorthand equality', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: '', verified: true },
  { group: 'Filters', feature: 'not', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'NULL rows are excluded, as in Prisma.', verified: true },
  { group: 'Filters', feature: 'in, notIn', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'Empty lists behave as in Prisma.', verified: true },
  { group: 'Filters', feature: 'lt, lte, gt, gte', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'A null value falls back.', verified: true },
  { group: 'Filters', feature: 'contains, startsWith, endsWith', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: '`%` and `_` are not escaped, as in Prisma.', verified: true },
  { group: 'Filters', feature: "mode: 'insensitive'", prisma: 'PostgreSQL', pg: 'accelerated', sqlite: 'na', note: 'PostgreSQL uses ILIKE. On SQLite, where Prisma rejects `mode`, prisma-sql accepts it and uses LOWER().', verified: true },
  { group: 'Filters', feature: 'search (full-text)', prisma: 'PostgreSQL (preview)', pg: 'fallback', sqlite: 'na', note: '', verified: true },
  { group: 'Filters', feature: 'AND, OR, NOT', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'Empty `OR` matches nothing, as in Prisma.', verified: true },
  { group: 'Filters', feature: 'some, every, none', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: '', verified: true },
  { group: 'Filters', feature: 'is, isNot', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: 'When both are given, `isNot` is dropped.', verified: true },
  { group: 'Filters', feature: 'Scalar lists: has, hasSome, hasEvery, isEmpty, equals', prisma: 'PostgreSQL', pg: 'partial', sqlite: 'na', note: '`not` accepts only `{ equals }`. `isEmpty` treats NULL lists as empty.', verified: true },
  { group: 'Filters', feature: 'Json path filter { path, equals }', prisma: 'PostgreSQL', pg: 'fallback', sqlite: 'fallback', note: '', verified: true },
  { group: 'Filters', feature: 'Json string_contains, string_starts_with, string_ends_with', prisma: 'PostgreSQL', pg: 'differs', sqlite: 'differs', note: 'Always case-insensitive and matched against the whole JSON text.', verified: true },
  { group: 'Filters', feature: 'Json array_contains, array_starts_with, array_ends_with', prisma: 'PostgreSQL', pg: 'fallback', sqlite: 'fallback', note: '', verified: true },
  { group: 'Filters', feature: 'DbNull, JsonNull, AnyNull', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: 'The filter may be dropped.', verified: false },
  { group: 'Filters', feature: 'Field references (model.fields.x)', prisma: PG_SQLITE, pg: 'fallback', sqlite: 'fallback', note: '', verified: false },
  { group: 'Filters', feature: 'Compound unique where', prisma: PG_SQLITE, pg: 'fallback', sqlite: 'fallback', note: '', verified: true },
  { group: 'Filters', feature: 'null, undefined', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: '`undefined` is skipped, as in Prisma.', verified: true },
  { group: 'Filters', feature: 'Decimal and Bytes values', prisma: PG_SQLITE, pg: 'fallback', sqlite: 'fallback', note: '', verified: false },
  { group: 'Filters', feature: 'Enum values', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'Mapped to `@map` names.', verified: true },

  { group: 'Ordering', feature: 'Scalar asc / desc', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: '', verified: true },
  { group: 'Ordering', feature: '{ sort, nulls }', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'SQLite emulates NULLS FIRST / LAST.', verified: true },
  { group: 'Ordering', feature: 'Relation field', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'To-one relations, nested.', verified: true },
  { group: 'Ordering', feature: 'Relation _count', prisma: PG_SQLITE, pg: 'fallback', sqlite: 'fallback', note: '', verified: true },
  { group: 'Ordering', feature: '_relevance', prisma: 'PostgreSQL (preview)', pg: 'fallback', sqlite: 'na', note: '', verified: true },
  { group: 'Ordering', feature: 'groupBy by aggregate', prisma: PG_SQLITE, pg: 'fallback', sqlite: 'fallback', note: '', verified: false },
  { group: 'Ordering', feature: 'Optional relation { sort, nulls }', prisma: 'No', pg: 'extra', sqlite: 'extra', note: 'Type extension added by prisma-sql. Throws instead of falling back when unsupported.', verified: true },

  { group: 'Aggregates', feature: '_count, _sum, _avg, _min, _max', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: '', verified: true },
  { group: 'Aggregates', feature: 'groupBy having', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'equals, not, gt, gte, lt, lte, in, notIn. Other operators fall back.', verified: true },
  { group: 'Aggregates', feature: 'groupBy take, skip', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'accelerated', note: 'Accepted without `orderBy`; Prisma requires it.', verified: true },
  { group: 'Aggregates', feature: 'aggregate take, skip, cursor, orderBy', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: 'Ignored.', verified: true },
  { group: 'Aggregates', feature: '_count: true result shape', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: 'Returns `{ _all: n }`; Prisma returns `n`.', verified: false },

  { group: 'Client API', feature: '$transaction(async (tx) => …)', prisma: PG_SQLITE, pg: 'prisma', sqlite: 'prisma', note: 'Runs on the base client. Reads inside the callback are not accelerated.', verified: true },
  { group: 'Client API', feature: '$transaction([…])', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: 'Accelerated reads can run on the prisma-sql connection, outside the Prisma transaction.', verified: false },
  { group: 'Client API', feature: '$transaction([{ model, method, args }])', prisma: 'No', pg: 'extra', sqlite: 'missing', note: 'prisma-sql form with isolation level and timeout. PostgreSQL only.', verified: true },
  { group: 'Client API', feature: '$queryRaw, $executeRaw', prisma: PG_SQLITE, pg: 'prisma', sqlite: 'prisma', note: '', verified: true },
  { group: 'Client API', feature: '$queryRawTyped (TypedSQL)', prisma: 'PostgreSQL, SQLite (preview)', pg: 'prisma', sqlite: 'prisma', note: '', verified: false },
  { group: 'Client API', feature: 'findUnique batching', prisma: PG_SQLITE, pg: 'missing', sqlite: 'missing', note: 'Each findUnique runs its own SQL query.', verified: true },
  { group: 'Client API', feature: "log, $on('query')", prisma: PG_SQLITE, pg: 'partial', sqlite: 'partial', note: 'Accelerated queries do not reach Prisma logs. Use `debug` or `onQuery`.', verified: false },
  { group: 'Client API', feature: '$batch, $batchCount', prisma: 'No', pg: 'extra', sqlite: 'missing', note: 'Several reads in one round trip. BigInt and Decimal come back as JS numbers.', verified: true },
  { group: 'Client API', feature: 'createShardedReader', prisma: 'No', pg: 'extra', sqlite: 'extra', note: 'Returns raw rows: no type conversion, no enum mapping.', verified: true },
  { group: 'Client API', feature: 'Multiple schemas (@@schema)', prisma: 'PostgreSQL', pg: 'missing', sqlite: 'na', note: 'Schema is fixed to `public`.', verified: true },

  { group: 'Result types', feature: 'Decimal', prisma: PG_SQLITE, pg: 'differs', sqlite: 'unknown', note: 'String on flat rows, number inside included relations. Aggregates return Prisma.Decimal.', verified: true },
  { group: 'Result types', feature: 'BigInt', prisma: PG_SQLITE, pg: 'differs', sqlite: 'unknown', note: 'String on flat rows, number inside included relations. Aggregates return bigint.', verified: true },
  { group: 'Result types', feature: 'DateTime', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: 'PostgreSQL: Date on flat rows, string inside included relations. SQLite: raw number or string.', verified: true },
  { group: 'Result types', feature: 'Boolean', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'differs', note: 'SQLite returns 0 / 1.', verified: true },
  { group: 'Result types', feature: 'Bytes', prisma: PG_SQLITE, pg: 'differs', sqlite: 'unknown', note: 'Buffer on flat rows, hex string inside included relations.', verified: false },
  { group: 'Result types', feature: 'Json', prisma: PG_SQLITE, pg: 'accelerated', sqlite: 'differs', note: 'SQLite returns the raw JSON string when there is no include.', verified: true },
  { group: 'Result types', feature: 'Enum with @map', prisma: PG_SQLITE, pg: 'differs', sqlite: 'differs', note: 'The database value is returned, not the schema name.', verified: true },
]

export function countByStatus(rows: ParityRow[], db: 'pg' | 'sqlite'): Record<ParityStatus, number> {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<ParityStatus, number>
  for (const row of rows) counts[row[db]] += 1
  return counts
}

export function rowsByGroup(rows: ParityRow[]): { group: ParityGroup; rows: ParityRow[] }[] {
  return GROUP_ORDER.map((group) => ({ group, rows: rows.filter((r) => r.group === group) })).filter(
    (g) => g.rows.length > 0,
  )
}

export function inlineCode(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}
