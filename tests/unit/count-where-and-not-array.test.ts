import { describe, expect, it } from 'vitest'
import type { Model } from '../../src/types'
import { createToSQL, setModelStats } from '../../src'
import {
  prerenderSegment,
  resolvePrerenderedParams,
} from '../../src/builder/shared/prerendered-where-in'
import { prepareArrayParam } from '../../src/sql-builder-dialect'

type FieldDef = Model['fields'][number]

function scalar(
  name: string,
  type: string,
  extra: Partial<FieldDef> = {},
): FieldDef {
  return {
    name,
    dbName: name,
    type,
    isRequired: true,
    isRelation: false,
    ...extra,
  }
}

function toMany(
  name: string,
  relatedModel: string,
  foreignKey: string[],
  references: string[],
): FieldDef {
  return {
    name,
    type: relatedModel,
    isList: true,
    isRequired: true,
    isRelation: true,
    relatedModel,
    relationName: `${name}Relation`,
    foreignKey,
    references,
    isForeignKeyLocal: false,
  }
}

function toOne(
  name: string,
  relatedModel: string,
  foreignKey: string[],
  references: string[],
): FieldDef {
  return {
    name,
    type: relatedModel,
    isList: false,
    isRequired: true,
    isRelation: true,
    relatedModel,
    relationName: `${name}Relation`,
    foreignKey,
    references,
    isForeignKeyLocal: true,
  }
}

const parent: Model = {
  name: 'Parent',
  tableName: 'parents',
  fields: [
    scalar('tenant', 'Int', { isId: true }),
    scalar('code', 'Int', { isId: true }),
    scalar('label', 'String'),
    toMany(
      'children',
      'Child',
      ['parentTenant', 'parentCode'],
      ['tenant', 'code'],
    ),
  ],
} as Model

const child: Model = {
  name: 'Child',
  tableName: 'children',
  fields: [
    scalar('id', 'Int', { isId: true }),
    scalar('parentTenant', 'Int', { dbName: 'parent_tenant' }),
    scalar('parentCode', 'Int', { dbName: 'parent_code' }),
    scalar('flagged', 'Boolean', { dbName: 'is_flagged' }),
    scalar('state', 'String'),
    toOne(
      'parent',
      'Parent',
      ['parentTenant', 'parentCode'],
      ['tenant', 'code'],
    ),
  ],
} as Model

const models = [parent, child]

function whereOf(sql: string): string {
  const idx = sql.lastIndexOf(' WHERE ')
  return idx === -1 ? '' : sql.slice(idx)
}

describe.each(['postgres', 'sqlite'] as const)('%s', (dialect) => {
  const toSQL = createToSQL(models, dialect)

  describe('NOT array', () => {
    it('negates each element separately', () => {
      const { sql, params } = toSQL('Child', 'findMany', {
        where: { NOT: [{ state: 'a' }, { flagged: true }] },
      })

      const where = whereOf(sql)
      expect(where.match(/NOT \(/g)?.length).toBe(2)
      expect(where).not.toMatch(/NOT \(\(/)
      expect(params).toEqual(expect.arrayContaining(['a', true]))
    })

    it('keeps a single-element array as one negation', () => {
      const { sql } = toSQL('Child', 'findMany', {
        where: { NOT: [{ state: 'a' }] },
      })

      expect(whereOf(sql).match(/NOT /g)?.length).toBe(1)
    })

    it('negates each element of a HAVING NOT array separately', () => {
      const { sql } = toSQL('Child', 'groupBy', {
        by: ['state', 'flagged'],
        _count: { _all: true },
        having: {
          NOT: [
            { state: { _count: { gt: 1 } } },
            { flagged: { _count: { gt: 2 } } },
          ],
        },
      })

      const having = sql.slice(sql.indexOf(' HAVING '))
      expect(having.match(/NOT \(/g)?.length).toBe(2)
      expect(having).not.toMatch(/NOT \(\(/)
    })
  })

  describe('_count relation where', () => {
    it('applies the relation where', () => {
      const { sql, params } = toSQL('Parent', 'findMany', {
        select: {
          label: true,
          _count: { select: { children: { where: { state: 'open' } } } },
        },
      })

      expect(params).toContain('open')
      expect(sql).toMatch(/\.state = /)
    })

    it('groups and joins every composite key on its mapped column', () => {
      const { sql } = toSQL('Parent', 'findMany', {
        select: {
          label: true,
          _count: { select: { children: { where: { flagged: true } } } },
        },
      })

      expect(sql).toMatch(/\.parent_tenant AS "__fk0"/)
      expect(sql).toMatch(/\.parent_code AS "__fk1"/)
      expect(sql).toMatch(/"__fk0" = parents\.tenant/)
      expect(sql).toMatch(/"__fk1" = parents\.code/)
      expect(sql).toMatch(/\.is_flagged = /)
    })

    it('uses one grouped child scan instead of a correlated count', () => {
      const { sql } = toSQL('Parent', 'findMany', {
        select: {
          label: true,
          _count: { select: { children: true } },
        },
      })

      expect(sql).toMatch(/GROUP BY/)
      expect(sql.match(/COUNT\(\*\)/g)).toHaveLength(1)
      expect(sql).not.toMatch(/\.parent_tenant = parents\.tenant/)
    })

    it('keeps unfiltered and filtered counts side by side', () => {
      const { sql, params } = toSQL('Parent', 'findMany', {
        where: { label: 'x' },
        select: {
          label: true,
          _count: {
            select: {
              children: { where: { NOT: [{ state: 'a' }, { flagged: true }] } },
            },
          },
        },
      })

      expect(params).toEqual(expect.arrayContaining(['x', 'a', true]))
      expect(sql).not.toMatch(/NOT \(\(/)
    })

    it('restricts a grouped count to the bounded parent page', () => {
      const { sql } = toSQL('Parent', 'findMany', {
        where: { label: 'x' },
        select: {
          label: true,
          _count: { select: { children: { where: { state: 'open' } } } },
        },
        orderBy: [{ tenant: 'asc' }, { code: 'asc' }],
        take: 2,
      })

      expect(sql).toMatch(/\.parent_tenant, .*\.parent_code\) IN \(SELECT/)
      expect(sql).toMatch(/SELECT parents\.tenant, parents\.code FROM/)
      expect(sql.match(/LIMIT/g)).toHaveLength(2)
    })

    it('keeps one grouped scan for a known small child table', () => {
      setModelStats({
        Child: { rowCount: 100, tableName: 'children', known: true },
      })

      try {
        const { sql } = toSQL('Parent', 'findMany', {
          select: {
            label: true,
            _count: { select: { children: true } },
          },
          take: 3,
        })

        expect(sql).not.toMatch(/ IN \(SELECT/)
        expect(sql.match(/LIMIT/g)).toHaveLength(1)
      } finally {
        setModelStats({})
      }
    })

    it('restricts a known large child table to the parent page', () => {
      setModelStats({
        Child: { rowCount: 100_001, tableName: 'children', known: true },
      })

      try {
        const { sql } = toSQL('Parent', 'findMany', {
          select: {
            label: true,
            _count: { select: { children: true } },
          },
          take: 2,
        })

        expect(sql).toMatch(/ IN \(SELECT/)
        expect(sql.match(/LIMIT/g)).toHaveLength(2)
      } finally {
        setModelStats({})
      }
    })
  })
})

describe('sqlite placeholder order', () => {
  const toSQL = createToSQL(models, 'sqlite')

  it('binds relation count params before main where params', () => {
    const { sql, params } = toSQL('Parent', 'findMany', {
      where: { label: 'x' },
      select: {
        label: true,
        _count: { select: { children: { where: { state: 'open' } } } },
      },
    })

    expect(sql).not.toMatch(/\$\d/)
    expect(params).toEqual(['open', 'x'])
  })

  it('binds nested relation where params before main where params', () => {
    const { sql, params } = toSQL('Parent', 'findMany', {
      where: { label: 'x' },
      select: {
        label: true,
        children: { where: { state: 'open' }, select: { id: true } },
      },
    })

    expect(sql).not.toMatch(/\$\d/)
    expect(params).toEqual(['open', 'x'])
  })
})

interface BuiltSql {
  sql: string
  params: readonly unknown[]
  paramMappings?: readonly {
    index: number
    value?: unknown
    dynamicName?: string
  }[]
}

function expectMappingsInSqlOrder(built: BuiltSql): void {
  const mappings = built.paramMappings ?? []
  expect(built.sql.match(/\?/g)?.length ?? 0).toBe(built.params.length)
  expect(mappings.map((m) => m.index)).toEqual(
    built.params.map((_, i) => i + 1),
  )
  mappings.forEach((m, i) => {
    if (m.dynamicName === undefined) expect(m.value).toEqual(built.params[i])
  })
}

describe('sqlite param mappings', () => {
  const toSQL = createToSQL(models, 'sqlite')

  it('reorders static mappings with a relation count before the root where', () => {
    const built = toSQL('Parent', 'findMany', {
      where: { label: 'x' },
      select: {
        label: true,
        _count: { select: { children: { where: { state: 'open' } } } },
      },
    })

    expect(built.params).toEqual(['open', 'x'])
    expectMappingsInSqlOrder(built)
  })

  it('reorders dynamic mappings with a relation count before the root where', () => {
    const built = toSQL('Parent', 'findMany', {
      where: { label: '$rootLabel' },
      select: {
        label: true,
        _count: { select: { children: { where: { state: '$childState' } } } },
      },
    })

    const names = (built.paramMappings ?? []).map((m) => m.dynamicName ?? '')
    expect(names).toHaveLength(2)
    expect(names[0]).toContain('childState')
    expect(names[1]).toContain('rootLabel')
    expectMappingsInSqlOrder(built)
  })

  it('expands a repeated dynamic placeholder into one mapping per occurrence', () => {
    const built = toSQL('Parent', 'findMany', {
      where: { label: '$shared' },
      select: {
        label: true,
        _count: { select: { children: { where: { state: '$shared' } } } },
      },
    })

    const names = (built.paramMappings ?? []).map((m) => m.dynamicName ?? '')
    expect(names).toHaveLength(2)
    expect(names.every((n) => n.includes('shared'))).toBe(true)
    expectMappingsInSqlOrder(built)
  })

  it('resolves prerendered where-in params in SQL order with a filtered nested count', () => {
    const owner: Model = {
      name: 'Owner',
      tableName: 'owners',
      fields: [
        scalar('id', 'Int', { isId: true }),
        toMany('pets', 'Pet', ['ownerId'], ['id']),
      ],
    } as Model
    const pet: Model = {
      name: 'Pet',
      tableName: 'pets',
      fields: [
        scalar('id', 'Int', { isId: true }),
        scalar('ownerId', 'Int', { dbName: 'owner_id' }),
        scalar('kind', 'String'),
        toOne('owner', 'Owner', ['ownerId'], ['id']),
        toMany('toys', 'Toy', ['petId'], ['id']),
      ],
    } as Model
    const toy: Model = {
      name: 'Toy',
      tableName: 'toys',
      fields: [
        scalar('id', 'Int', { isId: true }),
        scalar('petId', 'Int', { dbName: 'pet_id' }),
        scalar('color', 'String'),
        toOne('pet', 'Pet', ['petId'], ['id']),
      ],
    } as Model
    const petModels = [owner, pet, toy]

    const prerendered = prerenderSegment(
      {
        childModelName: 'Pet',
        fkFieldNames: ['ownerId'],
        isList: true,
        parentKeyFieldNames: ['id'],
        relArgs: {
          select: {
            id: true,
            _count: { select: { toys: { where: { color: 'red' } } } },
          },
          where: { kind: 'dog' },
        },
        relationName: 'pets',
      },
      0,
      petModels,
      new Map(petModels.map((m) => [m.name, m])),
      'sqlite',
    )

    expect(prerendered).not.toBeNull()
    const mappings = prerendered!.paramMappings
    expect(prerendered!.sql.match(/\?/g)?.length).toBe(mappings.length)
    expect(mappings.map((m) => m.index)).toEqual([1, 2, 3])
    expect(mappings.map((m) => m.value)).toEqual(['red', 'dog', undefined])

    const inName = mappings[2].dynamicName
    expect(inName).toContain(prerendered!.dynamicInName)
    const params = resolvePrerenderedParams(mappings, inName!, [1, 2], 'sqlite')

    expect(params).toEqual(['red', 'dog', prepareArrayParam([1, 2], 'sqlite')])
  })
})
