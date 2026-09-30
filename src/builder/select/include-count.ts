import { Model, Field } from '../../types'
import { SqlDialect } from '../../sql-builder-dialect'
import { SQL_SEPARATORS } from '../shared/constants'
import { quoteColumn, sqlStringLiteral } from '../shared/sql-utils'
import { ParamStore } from '../shared/param-store'
import { createAliasGenerator } from '../shared/alias-generator'
import { AliasGenerator } from '../shared/types'
import { isValidRelationField } from '../joins'
import { isNotNullish, isPlainObject } from '../shared/validators/type-guards'
import { isValidWhereClause } from '../shared/validators/sql-validators'
import {
  getRelationFieldSet,
  getFieldIndices,
} from '../shared/model-field-cache'
import { resolveRelationKeys } from '../shared/relation-key-utils'
import { getRelationTableReference } from './include-join'
import { buildWhereClause } from '../where'
import {
  buildFkJoinCondition,
  buildFkPartitionBy,
  buildFkSelectList,
} from '../shared/fk-join-utils'
import { getModelStats, getStrategyConfig } from './strategy-estimator'

const COUNT_SUBQUERY_PREFIX = '__tp_cnt_'
const COUNT_JOIN_PREFIX = '__tp_cnt_j_'
const COUNT_COLUMN = '__cnt'

export type RelationCountSelect = Record<string, unknown>
export type ParentKeySubqueryBuilder = (
  parentKeys: readonly string[],
) => string | null

interface RelationCountBuild {
  joins: string[]
  jsonPairs: string
}

function resolveCountRelationOrThrow(
  relName: string,
  model: Model,
  schemaByName: Map<string, Model>,
): { field: Field; relModel: Model } {
  const relationSet = getRelationFieldSet(model)
  if (!relationSet.has(relName)) {
    throw new Error(
      `_count.${relName} references unknown relation on model ${model.name}`,
    )
  }

  const field = getFieldIndices(model).allFieldsByName.get(relName) as
    | Field
    | undefined
  if (!field) {
    throw new Error(
      `_count.${relName} references unknown relation on model ${model.name}`,
    )
  }

  if (!isValidRelationField(field)) {
    throw new Error(
      `_count.${relName} has invalid relation metadata on model ${model.name}`,
    )
  }

  const relatedModelName = field.relatedModel
  if (
    !isNotNullish(relatedModelName) ||
    String(relatedModelName).trim().length === 0
  ) {
    throw new Error(
      `_count.${relName} is missing relatedModel metadata on model ${model.name}`,
    )
  }

  const relModel = schemaByName.get(relatedModelName)
  if (!relModel) {
    throw new Error(
      `Related model '${relatedModelName}' not found for _count.${relName}`,
    )
  }

  return { field, relModel }
}

function readCountWhere(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null
  const where = value.where
  if (!isPlainObject(where) || Object.keys(where).length === 0) return null
  return where
}

function nextAliasAvoiding(
  aliasGen: AliasGenerator,
  base: string,
  forbidden: Set<string>,
): string {
  let alias = aliasGen.next(base)
  while (forbidden.has(alias)) alias = aliasGen.next(base)
  return alias
}

function buildCountSubquery(args: {
  countAlias: string
  relModel: Model
  childKeys: string[]
  parentKeySubquery: string | null
  where: Record<string, unknown> | null
  schemas: readonly Model[]
  params: ParamStore
  dialect: SqlDialect
  aliasGen: AliasGenerator
}): string {
  const relTable = getRelationTableReference(args.relModel, args.dialect)
  const selectKeys = buildFkSelectList(
    args.countAlias,
    args.relModel,
    args.childKeys,
  )
  const groupByKeys = buildFkPartitionBy(
    args.countAlias,
    args.relModel,
    args.childKeys,
  )

  const conditions: string[] = []
  if (args.parentKeySubquery) {
    const childKeySql = args.childKeys
      .map(
        (childKey) =>
          `${args.countAlias}.${quoteColumn(args.relModel, childKey)}`,
      )
      .join(SQL_SEPARATORS.FIELD_LIST)
    const childKeyExpr =
      args.childKeys.length === 1 ? childKeySql : `(${childKeySql})`
    conditions.push(`${childKeyExpr} IN (${args.parentKeySubquery})`)
  }

  let whereJoins = ''
  if (args.where) {
    const whereResult = buildWhereClause(args.where, {
      alias: args.countAlias,
      model: args.relModel,
      schemaModels: args.schemas,
      params: args.params,
      isSubquery: true,
      aliasGen: args.aliasGen,
      dialect: args.dialect,
    })
    if (whereResult.joins.length > 0) {
      whereJoins = ' ' + whereResult.joins.join(' ')
    }
    if (isValidWhereClause(whereResult.clause)) {
      conditions.push(`(${whereResult.clause})`)
    }
  }

  const whereClause =
    conditions.length > 0
      ? ` WHERE ${conditions.join(SQL_SEPARATORS.CONDITION_AND)}`
      : ''

  const cntExpr =
    args.dialect === 'postgres'
      ? `COUNT(*)::int AS ${COUNT_COLUMN}`
      : `COUNT(*) AS ${COUNT_COLUMN}`

  return `(SELECT ${selectKeys}${SQL_SEPARATORS.FIELD_LIST}${cntExpr} FROM ${relTable} ${args.countAlias}${whereJoins}${whereClause} GROUP BY ${groupByKeys})`
}

function buildCountJoinAndPair(args: {
  relName: string
  field: Field
  relModel: Model
  parentModel: Model
  parentAlias: string
  where: Record<string, unknown> | null
  schemas: readonly Model[]
  params: ParamStore
  dialect: SqlDialect
  aliasGen: AliasGenerator
  parentKeySubqueryBuilder?: ParentKeySubqueryBuilder
}): { joinSql: string; pairSql: string } {
  const { childKeys, parentKeys } = resolveRelationKeys(args.field, 'count')
  const forbidden = new Set<string>([args.parentAlias])

  const countAlias = nextAliasAvoiding(
    args.aliasGen,
    `${COUNT_SUBQUERY_PREFIX}${args.relName}`,
    forbidden,
  )
  forbidden.add(countAlias)

  const childStats = getModelStats()?.[args.relModel.name]
  const largeChildThreshold = getStrategyConfig().largeChildTableRows
  const shouldRestrictToParentPage =
    !childStats ||
    childStats.known === false ||
    !Number.isFinite(childStats.rowCount) ||
    childStats.rowCount < 0 ||
    childStats.rowCount > largeChildThreshold

  const subquery = buildCountSubquery({
    countAlias,
    relModel: args.relModel,
    childKeys,
    parentKeySubquery:
      (shouldRestrictToParentPage
        ? args.parentKeySubqueryBuilder?.(parentKeys)
        : null) ?? null,
    where: args.where,
    schemas: args.schemas,
    params: args.params,
    dialect: args.dialect,
    aliasGen: args.aliasGen,
  })

  const joinAlias = nextAliasAvoiding(
    args.aliasGen,
    `${COUNT_JOIN_PREFIX}${args.relName}`,
    forbidden,
  )
  const leftJoinOn = buildFkJoinCondition(
    joinAlias,
    args.parentAlias,
    args.parentModel,
    parentKeys,
  )

  return {
    joinSql: `LEFT JOIN ${subquery} ${joinAlias} ON ${leftJoinOn}`,
    pairSql: `${sqlStringLiteral(args.relName)}, COALESCE(${joinAlias}.${COUNT_COLUMN}, 0)`,
  }
}

export function buildRelationCountSql(
  countSelect: RelationCountSelect,
  model: Model,
  schemas: readonly Model[],
  parentAlias: string,
  params: ParamStore,
  dialect: SqlDialect,
  modelMap?: Map<string, Model>,
  aliasGen: AliasGenerator = createAliasGenerator(),
  parentKeySubqueryBuilder?: ParentKeySubqueryBuilder,
): RelationCountBuild {
  const joins: string[] = []
  const pairs: string[] = []

  const schemaByName =
    modelMap ?? new Map<string, Model>(schemas.map((m) => [m.name, m]))

  for (const [relName, shouldCount] of Object.entries(countSelect)) {
    if (!shouldCount) continue

    const resolved = resolveCountRelationOrThrow(relName, model, schemaByName)
    const built = buildCountJoinAndPair({
      relName,
      field: resolved.field,
      relModel: resolved.relModel,
      parentModel: model,
      parentAlias,
      where: readCountWhere(shouldCount),
      schemas,
      params,
      dialect,
      aliasGen,
      parentKeySubqueryBuilder,
    })

    joins.push(built.joinSql)
    pairs.push(built.pairSql)
  }

  return { joins, jsonPairs: pairs.join(SQL_SEPARATORS.FIELD_LIST) }
}
