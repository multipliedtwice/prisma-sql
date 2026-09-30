# Feature parity: Prisma Client vs prisma-sql

Date: 2026-09-30. Base: prisma-sql 1.92.0 working tree.

## Sources

- Prisma side: official docs, pulled as `.md` from prisma.io (v7 reference `orm/v7/reference/prisma-client-reference`, v6 reference, v7 query pages, v8 `orm/reference/orm-client`, `orm/coming-from-prisma-orm-7`). Full URL list in bottom section.
- prisma-sql side: static code read of `src/`. No test run. Spot-checked by hand: `omit` absent in `src/`, findFirst drops `cursor`, aggregate ignores `take/skip/cursor/orderBy`, `ACCELERATED_METHODS` set, no find-path scalar conversion in `result-transformers.ts` (aggregate conversion exists).
- Rows marked "not verified" = inferred from code path, not proven by run.

## Legend

- `ACCEL` — intercepted and translated to SQL by prisma-sql. Sub-feature gaps listed in own rows (e.g. `findMany` row `ACCEL`, but cursor / omit / result-type rows carry their own status).
- `PARTIAL` — accelerated, some sub-feature missing. Gap in note.
- `FALLBACK` — builder throws, Prisma runs query. Correct result, no speedup. One `console.warn` per fallback (`src/code-emitter.ts:1105`).
- `DELEGATED` — never intercepted, Prisma runs it.
- `SILENT` — accelerated but result can differ from Prisma, no error. Highest priority.
- `N/A` — Prisma itself not support on that DB.

Fallback only when `fallbackOnError: true` (default, `src/code-emitter.ts:747`).

## How hook works

Generator emits `speedExtension()` = Prisma `$extends` with `query.$allModels.$allOperations` (`src/code-emitter.ts:1565-1583`). Only `findMany, findFirst, findUnique, count, aggregate, groupBy` accelerated (`src/code-emitter.ts:352-359`). All else goes `query(args)` to Prisma.

## 1. Model methods

| Method                                    | Prisma PG / SQLite | prisma-sql PG    | prisma-sql SQLite | Note / evidence                                                                                                                                                                                 |
| ----------------------------------------- | ------------------ | ---------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| findMany                                  | yes / yes          | ACCEL            | ACCEL             | `src/query-cache.ts:163`                                                                                                                                                                        |
| findFirst                                 | yes / yes          | PARTIAL + SILENT | PARTIAL + SILENT  | forced `take: 1`; `cursor` dropped; negative `take` ignored (returns first, not last) `src/builder/pagination.ts:882-885`. `distinct` throws, FALLBACK `src/builder/select/assembly.ts:298-306` |
| findUnique                                | yes / yes          | PARTIAL          | PARTIAL           | compound unique `a_b: {a, b}` throws `field 'a_b' does not exist`, FALLBACK `src/builder/where/builder.ts:302`                                                                                  |
| findUniqueOrThrow                         | yes / yes          | DELEGATED        | DELEGATED         | not in accelerated set                                                                                                                                                                          |
| findFirstOrThrow                          | yes / yes          | DELEGATED        | DELEGATED         | not in accelerated set                                                                                                                                                                          |
| count                                     | yes / yes          | PARTIAL + SILENT | PARTIAL + SILENT  | `select: {_all, field}` ignored, returns number not object `src/builder/aggregates.ts:929-936`. Negative take FALLBACK `:855`                                                                   |
| aggregate                                 | yes / yes          | PARTIAL + SILENT | PARTIAL + SILENT  | `take/skip/cursor/orderBy` ignored, wrong numbers `src/builder/aggregates.ts:663-712`. `_count: true` returns `{_all: n}` not `n` (not verified by run)                                         |
| groupBy                                   | yes / yes          | PARTIAL          | PARTIAL           | `by: 'x'` string throws, FALLBACK `src/builder/aggregates.ts:715-717`. Aggregate orderBy likely FALLBACK (not verified). `take/skip` allowed without orderBy (Prisma rejects)                   |
| create / createMany / createManyAndReturn | yes / yes          | DELEGATED        | DELEGATED         |                                                                                                                                                                                                 |
| update / updateMany / updateManyAndReturn | yes / yes          | DELEGATED        | DELEGATED         |                                                                                                                                                                                                 |
| upsert / delete / deleteMany              | yes / yes          | DELEGATED        | DELEGATED         |                                                                                                                                                                                                 |
| findManyStream / findManyReduceStream     | no (lib extra)     | ACCEL            | throws            | `src/code-emitter.ts:1136`, `:1286`                                                                                                                                                             |

Risk: `PrismaMethod` type includes write names (`src/types.ts:47-53`). `createToSQL`, `createShardedReader`, library `$transaction([{model, method}])` send unknown method to `buildSelectSql` (`src/query-cache.ts:163-172`) — write method silently becomes SELECT. No guard.

## 2. Query options

| Option                                    | Prisma PG / SQLite                        | prisma-sql PG         | prisma-sql SQLite     | Note / evidence                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------- | --------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| select (scalar, relation, `_count`)       | yes / yes                                 | ACCEL                 | ACCEL                 | unknown field FALLBACK `src/builder/select/fields.ts:155`                                                                                                                                                                                                                              |
| include                                   | yes / yes                                 | ACCEL                 | ACCEL                 | depth / per-level / circular / subquery limits throw, FALLBACK `src/builder/select/includes.ts:885-949`                                                                                                                                                                                |
| omit (query)                              | yes / yes                                 | SILENT                | SILENT                | not read anywhere in `src/`. Omitted fields returned. Fast path also returns all columns                                                                                                                                                                                               |
| omit (global, `new PrismaClient({omit})`) | yes / yes                                 | SILENT                | SILENT                | hook sees only call args. Security risk: `password` leaks (not verified by run)                                                                                                                                                                                                        |
| where                                     | yes / yes                                 | ACCEL                 | ACCEL                 | see section 3                                                                                                                                                                                                                                                                          |
| distinct                                  | yes (in-memory; `nativeDistinct` preview) | PARTIAL + SILENT      | PARTIAL               | PG `DISTINCT ON`, distinct fields forced to front of ORDER BY `src/builder/select/assembly.ts:490-528` — order and `take` window differ when user orderBy not start with distinct fields (not verified by run). SQLite window fn; with cursor FALLBACK `src/builder/select.ts:505-514` |
| take / skip                               | yes / yes                                 | ACCEL                 | ACCEL                 |                                                                                                                                                                                                                                                                                        |
| negative take (root)                      | yes / yes                                 | PARTIAL               | PARTIAL               | needs orderBy, no relation orderBy, orderBy field selected — else FALLBACK `src/builder/select.ts:247-346`                                                                                                                                                                             |
| cursor                                    | yes / yes                                 | PARTIAL + SILENT      | PARTIAL + SILENT      | single-field fast path no cursor-row existence check: Prisma returns `[]`, prisma-sql returns rows `src/builder/pagination.ts:602-720`. Cursor without orderBy = no ORDER BY                                                                                                           |
| relationLoadStrategy                      | PG preview `relationJoins` / N/A          | ignored               | ignored               | internal planner picks strategy                                                                                                                                                                                                                                                        |
| `_count` with `where`                     | yes / yes                                 | ACCEL                 | ACCEL                 | root `_count: true` expands to to-one relations too (Prisma: list only) `src/builder/select/assembly.ts:82-89` (not verified by run)                                                                                                                                                   |
| nested where / take / skip                | yes / yes                                 | ACCEL                 | ACCEL                 | `src/builder/select/includes.ts:165-190`                                                                                                                                                                                                                                               |
| nested orderBy                            | yes / yes                                 | PARTIAL               | PARTIAL               | scalar only; relation orderBy FALLBACK                                                                                                                                                                                                                                                 |
| nested cursor / distinct                  | yes / yes                                 | SILENT (not verified) | SILENT (not verified) | correlated / flat-join builders not read them. where-in copies `cursor` / `distinct` into one batched child query for all parents `src/builder/shared/where-in-utils.ts:211-212` (take / skip now sliced per parent)                                                                   |

## 3. Filters

| Filter                                                  | Prisma PG / SQLite                     | prisma-sql PG           | prisma-sql SQLite         | Note / evidence                                                                                              |
| ------------------------------------------------------- | -------------------------------------- | ----------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| equals, implicit equality                               | yes / yes                              | ACCEL                   | ACCEL                     |                                                                                                              |
| not                                                     | yes / yes                              | ACCEL                   | ACCEL                     | `<>`, NULL rows excluded, same as Prisma                                                                     |
| in / notIn                                              | yes / yes                              | ACCEL                   | ACCEL                     | empty `in` = `0=1`, empty `notIn` = `1=1`                                                                    |
| lt / lte / gt / gte                                     | yes / yes                              | ACCEL                   | ACCEL                     | null value FALLBACK                                                                                          |
| contains / startsWith / endsWith                        | yes / yes                              | ACCEL                   | ACCEL                     | `%` `_` not escaped — same as Prisma (docs: user must escape). Matches Prisma                                |
| mode: 'insensitive'                                     | yes / N/A                              | ACCEL                   | accepted (Prisma rejects) | `src/sql-builder-dialect.ts:108-128`. No SQLite test                                                         |
| search (full-text)                                      | preview `fullTextSearchPostgres` / N/A | FALLBACK                | N/A                       | `Unsupported scalar operator: search`                                                                        |
| AND / OR / NOT                                          | yes / yes                              | ACCEL                   | ACCEL                     | `OR: []` = `0=1` matches Prisma                                                                              |
| some / every / none                                     | yes / yes                              | ACCEL                   | ACCEL                     | `src/builder/where/relations.ts:134-211`                                                                     |
| is / isNot                                              | yes / yes                              | PARTIAL + SILENT        | PARTIAL + SILENT          | both `is` and `isNot` given: `isNot` dropped `src/builder/where/relations.ts:244-249`                        |
| scalar list has / hasSome / hasEvery / isEmpty / equals | yes / N/A                              | PARTIAL                 | N/A                       | `not` only accepts `{equals}`. `isEmpty` treats NULL as empty (Prisma: NULL ignored). No e2e schema coverage |
| Json `{path, equals}` (Prisma shape)                    | yes / not listed                       | FALLBACK                | FALLBACK                  | only non-Prisma shape `{path: {path, ...}}` accelerated `src/builder/where/operators-json.ts:71-165`         |
| Json string_contains / starts / ends                    | yes / not listed                       | SILENT                  | SILENT                    | always case-insensitive, match on whole `::text` `src/builder/where/operators-json.ts:197-199`               |
| Json array_contains / starts / ends                     | yes / not listed                       | FALLBACK                | FALLBACK                  |                                                                                                              |
| DbNull / JsonNull / AnyNull                             | yes / yes                              | SILENT (not verified)   | SILENT (not verified)     | class instance flattened to `{}` then `1=1`, filter dropped `src/code-emitter.ts:662-663`                    |
| field refs `prisma.m.fields.x`                          | yes / yes                              | FALLBACK (not verified) | FALLBACK (not verified)   | FieldRef flattened, unsupported operator                                                                     |
| compound unique where                                   | yes / yes                              | FALLBACK                | FALLBACK                  | see findUnique                                                                                               |
| null / undefined                                        | yes / yes                              | ACCEL                   | ACCEL                     | undefined skipped like Prisma                                                                                |
| Decimal / Bytes as value                                | yes / yes                              | FALLBACK (not verified) | FALLBACK (not verified)   | instance flattened                                                                                           |
| enum values                                             | yes / yes                              | ACCEL                   | ACCEL                     | mapped to `@map` dbName                                                                                      |

## 4. orderBy

| Variant                           | Prisma PG / SQLite | prisma-sql PG           | prisma-sql SQLite       | Note / evidence                                            |
| --------------------------------- | ------------------ | ----------------------- | ----------------------- | ---------------------------------------------------------- |
| scalar asc/desc                   | yes / yes          | ACCEL                   | ACCEL                   |                                                            |
| `{sort, nulls}`                   | yes / yes          | ACCEL                   | ACCEL                   | SQLite emulated via `IS NULL`                              |
| relation field (to-one, nested)   | yes / yes          | ACCEL                   | ACCEL                   | `src/builder/shared/order-by-relation.ts:57-148`           |
| optional-relation `{sort, nulls}` | no (lib extension) | ACCEL                   | ACCEL                   | throws instead of fallback `src/code-emitter.ts:1115-1118` |
| relation `_count`                 | yes / yes          | FALLBACK                | FALLBACK                | `src/builder/shared/order-by-relation.ts:71-75`            |
| `_relevance`                      | preview / N/A      | FALLBACK                | N/A                     |                                                            |
| groupBy by aggregate              | yes / yes          | FALLBACK (not verified) | FALLBACK (not verified) |                                                            |

## 5. Aggregates

| Feature                                  | Prisma              | prisma-sql PG         | prisma-sql SQLite     | Note                                                              |
| ---------------------------------------- | ------------------- | --------------------- | --------------------- | ----------------------------------------------------------------- |
| `_count _sum _avg _min _max`             | yes                 | ACCEL                 | ACCEL                 | `src/builder/aggregates.ts:508-661`                               |
| groupBy `having`                         | yes                 | ACCEL                 | ACCEL                 | ops: equals, not, gt, gte, lt, lte, in, notIn. Other ops FALLBACK |
| groupBy take / skip                      | yes (needs orderBy) | ACCEL                 | ACCEL                 | no orderBy requirement                                            |
| aggregate take / skip / cursor / orderBy | yes                 | SILENT                | SILENT                | ignored                                                           |
| `_count: true` shape                     | `n`                 | SILENT (not verified) | SILENT (not verified) | returns `{_all: n}`                                               |

## 6. Client level

| Feature                                     | Prisma                                     | prisma-sql               | Note                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$transaction(fn)` interactive              | yes                                        | DELEGATED                | goes to base client `prisma.$transaction` `src/code-emitter.ts:859`, `:1484-1486`. Callback `tx` = base client, reads not accelerated                             |
| `$transaction([...])` array                 | yes                                        | DELEGATED + SILENT risk  | promises built on extended client can run accelerated reads on prisma-sql own connection, outside Prisma tx `src/code-emitter.ts:1504-1510` (not verified by run) |
| lib `$transaction([{model, method, args}])` | no (lib extra)                             | PG only                  | SQLite throws `src/transaction.ts:77`. Decimal stays string                                                                                                       |
| `$queryRaw` / `$executeRaw` / Unsafe        | yes                                        | DELEGATED                |                                                                                                                                                                   |
| TypedSQL `$queryRawTyped`                   | preview                                    | DELEGATED (not verified) |                                                                                                                                                                   |
| `$extends` chaining                         | yes                                        | extension itself         | ordering with user result extensions not verified                                                                                                                 |
| fluent API `.posts()`                       | yes                                        | not verified             |                                                                                                                                                                   |
| findUnique batching (dataloader)            | yes                                        | missing                  | each findUnique = own SQL                                                                                                                                         |
| logging `log` / `$on('query')`              | yes                                        | PARTIAL                  | accelerated queries invisible to Prisma log. Own `debug`, `onQuery`                                                                                               |
| `$batch` / `$batchCount`                    | no (lib extra)                             | PG only                  | `row_to_json`: BigInt / Decimal become JS number (lossy)                                                                                                          |
| `createShardedReader`                       | no (lib extra)                             | PARTIAL                  | raw rows, no transform, no enum map, no method guard `src/shard.ts:37-47`                                                                                         |
| global `omit` option                        | yes                                        | SILENT                   | see section 2                                                                                                                                                     |
| Postgres `@@schema` / multiSchema           | GA 6.13                                    | missing                  | schema hardcoded `'public'` `src/builder/shared/constants.ts:83`                                                                                                  |
| providers                                   | PG, SQLite, MySQL, MSSQL, Cockroach, Mongo | PG, SQLite               | other providers fail at generate `src/generator.ts:8-17`                                                                                                          |

## 7. Result types (find\* paths)

| Type        | Prisma           | prisma-sql PG                                   | prisma-sql SQLite          | Note                                                                |
| ----------- | ---------------- | ----------------------------------------------- | -------------------------- | ------------------------------------------------------------------- |
| Decimal     | `Prisma.Decimal` | string (flat), number (JSON include)            | not verified               | aggregates converted `src/builder/select/row-transformers.ts:42-99` |
| BigInt      | bigint           | string (flat), number (JSON include, `$batch`)  | not verified               | aggregates converted                                                |
| DateTime    | Date             | Date (flat, flat-join), string (JSON include)   | raw number / string        | ROADMAP "verify CLI DateTime drift" open                            |
| Boolean     | boolean          | boolean                                         | 0/1 (no conversion found)  |                                                                     |
| Bytes       | Uint8Array       | Buffer (flat), hex string (JSON) (not verified) | not verified               |                                                                     |
| Json        | object           | object                                          | raw string without include | parsed only in reducers                                             |
| Enum `@map` | schema name      | DB value                                        | DB value                   | output not mapped back `src/code-emitter.ts:46-71`                  |

Test gap: e2e comparator `tests/helpers/compare.ts:4-68` normalizes Date to null, Decimal / bigint / numeric strings to number, 0/1 to boolean. Section 7 differences invisible to e2e suite. `prisma-sql-verify` stricter (`src/verify-compare.ts:21-38`, `:122-127`): keeps typeof check, so 0/1 vs boolean and number vs string fail. Relaxed only for: Date vs its ISO string, bigint vs numeric string, Bytes vs base64 string, Decimal vs number. Runs with fallback on, so fallen-back queries count as pass.

## 8. Prisma 8

Prisma docs: v8 = new API, RC (`prisma` 8.0.0-rc.17, GA expected October 2026). No generated `PrismaClient`, no `$extends` ("will not be added"), fluent `db.orm.public.User.where(...).all()`, middleware instead of extensions, `Temporal` dates, Decimal as string, dotted error codes. `@prisma/client` stays 7.10.0 per docs.

prisma-sql hook = `$extends`. Not possible on v8 API as documented. Repo test matrix pins `8.1.0-dev.1` for `@prisma/client` (`tests/helpers/prisma-versions.ts:11`) — conflicts with docs claim that `@prisma/client` not part of v8. Unresolved: what `8.1.0-dev.1` build is. I don't know.

If v8 GA ships as documented: prisma-sql as `$extends` extension not usable on v8 API.

## Silent divergence list (priority order)

1. omit (query + global) ignored — data leak risk.
2. Array `$transaction([...])`: accelerated reads outside tx (not verified by run).
3. aggregate `take/skip/cursor/orderBy` ignored — wrong numbers.
4. findFirst `cursor` and negative `take` ignored.
5. count `select` ignored — wrong shape.
6. cursor fast path: missing cursor row returns rows, Prisma returns `[]`.
7. Result types on find\* (Decimal, BigInt, DateTime in JSON includes, SQLite Boolean / DateTime / Json, enum `@map`).
8. Json `string_*` always case-insensitive, whole-text match.
9. `is` + `isNot` together: `isNot` dropped.
10. Json null sentinels flattened to `{}` (not verified).
11. Postgres distinct with orderBy not starting with distinct fields (not verified).
12. `_count: true` shape (aggregate / groupBy / root select) (not verified).
13. Nested cursor / distinct in include (not verified).
14. Write method names routed to SELECT in `createToSQL` / sharded reader / lib `$transaction`.

## Doc vs code drift

- `readme.md:1421-1429` "Not yet supported" list misses every item in silent list.
- `ARCHITECTURE.md` claims Decimal / BigInt / DateTime mapping in reducers — code maps only in aggregate row transformers.
- `ARCHITECTURE.md` lists lateral join as active — `buildLateralJoinSql` / `canUseLateralJoin` never called outside own file.
- `ARCHITECTURE.md` invariant "never return wrong results" contradicted by silent list.
- `readme.md:1495` references `examples/generator-mode` — not exist.
- `tests/e2e/runtime-api.test.ts:5-10` imports `speedExtension`, `createPrismaSQL`, `convertDMMFToModels` from `src/index` — not exported. Stale.
- `createToSQL` `defaultOrRewrite` no effect: query cache drops `_options` `src/query-cache.ts:200`.

## Not verified

- Every row tagged "not verified" above.
- Prisma docs gaps: nested take / skip / cursor / distinct on relations (types only, no doc example), which DBs `nativeDistinct` supports, Json lt/gt, v8 SQLite operator support, v8 Json null sentinels, v8 field refs.
- Prisma 8 API beyond pages listed below.

## Prisma doc URLs read

- https://www.prisma.io/docs/llms.txt
- https://www.prisma.io/docs/orm/v7/reference/prisma-client-reference
- https://www.prisma.io/docs/orm/v6/reference/prisma-client-reference
- https://www.prisma.io/docs/orm/v7/prisma-client/queries/ (aggregation-grouping-summarizing, crud, excluding-fields, filtering-and-sorting, full-text-search, pagination, relation-queries, select-fields, transactions, advanced/query-optimization-performance)
- https://www.prisma.io/docs/orm/v7/prisma-client/special-fields-and-types/ (composite-types, null-and-undefined, working-with-composite-ids-and-constraints, working-with-json-fields, working-with-scalar-lists-arrays)
- https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/ (raw-queries, typedsql)
- https://www.prisma.io/docs/orm/v7/prisma-client/client-extensions (+ model, client, query, result)
- https://www.prisma.io/docs/orm/v7/reference/preview-features/client-preview-features
- https://www.prisma.io/docs/orm/v7/reference/database-features
- https://www.prisma.io/docs/orm/v7/reference/error-reference
- https://www.prisma.io/docs/orm/v6/prisma-client/queries/ (case-sensitivity, filtering-and-sorting, full-text-search, pagination, relation-queries)
- https://www.prisma.io/docs/orm/v6/more/upgrades/to-v7
- https://www.prisma.io/docs/orm/reference/orm-client
- https://www.prisma.io/docs/orm/coming-from-prisma-orm-7
- https://www.prisma.io/docs/orm/release-status
- https://www.prisma.io/docs/orm/supported-databases
