import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model } from '../../src/types'
import {
  getModelStats,
  getRelationStats,
  getStrategyConfig,
  pickIncludeStrategy,
  setJsonRowFactor,
  setModelStats,
  setRelationStats,
  setRoundtripRowEquivalent,
  setStrategyConfig,
} from '../../src/builder/select/strategy-estimator'

const DEFAULT_CONFIG = {
  roundtripRowEquivalent: 73,
  jsonRowFactor: 1.5,
  correlatedBoundedFactor: 0.5,
  correlatedUnboundedFactor: 3,
  correlatedWherePenalty: 3,
  defaultFanOut: 10,
  defaultParentCount: 50,
  singleParentMaxFlatJoinDepth: 2,
  minStatsCoverage: 0.1,
  dynamicTakeEstimate: 10,
  largeChildTableRows: 100_000,
  smallParentCountThreshold: 1000,
}

function scalar(name: string, isId = false): Model['fields'][number] {
  return {
    name,
    dbName: name,
    type: 'Int',
    isId,
    isRequired: true,
    isRelation: false,
  }
}

function relation(
  name: string,
  relatedModel: string,
  isList: boolean,
): Model['fields'][number] {
  return {
    name,
    dbName: name,
    type: isList ? `${relatedModel}[]` : relatedModel,
    isRequired: !isList,
    isRelation: true,
    relatedModel,
    relationName: `${name}Relation`,
    foreignKey: `${relatedModel.toLowerCase()}Id`,
    references: 'id',
    isForeignKeyLocal: false,
  }
}

const root: Model = {
  name: 'Root',
  tableName: 'roots',
  fields: [
    scalar('id', true),
    relation('children', 'Child', true),
    relation('profile', 'Profile', false),
  ],
}
const child: Model = {
  name: 'Child',
  tableName: 'children',
  fields: [
    scalar('id', true),
    relation('grands', 'Grand', true),
    relation('profile', 'Profile', false),
  ],
}
const grand: Model = {
  name: 'Grand',
  tableName: 'grands',
  fields: [scalar('id', true), relation('greats', 'Great', true)],
}
const great: Model = {
  name: 'Great',
  tableName: 'greats',
  fields: [scalar('id', true)],
}
const profile: Model = {
  name: 'Profile',
  tableName: 'profiles',
  fields: [scalar('id', true)],
}
const schemas = [root, child, grand, great, profile]

function pick(overrides: Partial<Parameters<typeof pickIncludeStrategy>[0]>) {
  return pickIncludeStrategy({
    includeSpec: { children: { include: { grands: true } } },
    model: root,
    schemas,
    method: 'findMany',
    args: {},
    takeValue: 1,
    hasPagination: true,
    canFlatJoin: false,
    hasChildPagination: false,
    ...overrides,
  })
}

beforeEach(() => {
  setStrategyConfig(DEFAULT_CONFIG)
  setRelationStats({})
  setModelStats({
    Root: { rowCount: 10, tableName: 'roots' },
    Child: { rowCount: 10, tableName: 'children' },
    Grand: { rowCount: 10, tableName: 'grands' },
    Great: { rowCount: 10, tableName: 'greats' },
  })
})

describe('include strategy decisions', () => {
  it('exposes frozen config and planner-stat snapshots', () => {
    const relationStats = {
      Root: {
        children: { avg: 2, p95: 3, p99: 4, max: 5, coverage: 1 },
      },
    }
    const modelStats = {
      Root: { rowCount: 10, tableName: 'roots' },
    }

    setRelationStats(relationStats)
    setModelStats(modelStats)
    setRoundtripRowEquivalent(91)
    setJsonRowFactor(2)

    expect(getRelationStats()).toBe(relationStats)
    expect(getModelStats()).toBe(modelStats)
    expect(getStrategyConfig()).toMatchObject({
      roundtripRowEquivalent: 91,
      jsonRowFactor: 2,
    })
    expect(Object.isFrozen(getStrategyConfig())).toBe(true)
  })

  it('keeps deep unpaginated includes on the empirical where-in guard', () => {
    setRelationStats({
      Root: {
        children: { avg: 1, p95: 1, p99: 1, max: 1, coverage: 1 },
      },
      Child: {
        grands: { avg: 1, p95: 1, p99: 1, max: 1, coverage: 1 },
      },
    })

    expect(pick({ hasChildPagination: false })).toBe('where-in')
  })

  it('uses conservative fan-out defaults when relation stats are absent', () => {
    expect(pick({ hasChildPagination: false })).toBe('where-in')
  })

  it('routes deep bounded child pagination to where-in when stats are known', () => {
    expect(
      pick({
        includeSpec: { children: { include: { grands: true }, take: 5 } },
        hasChildPagination: true,
      }),
    ).toBe('where-in')
  })

  it('uses correlated pagination when descendants are only to-one', () => {
    expect(
      pick({
        includeSpec: {
          children: { include: { profile: true }, take: 5 },
        },
        hasChildPagination: true,
      }),
    ).toBe('correlated')
  })

  it('keeps the large-child guard for paginated lists with to-one descendants', () => {
    setModelStats({
      Root: { rowCount: 10, tableName: 'roots' },
      Child: { rowCount: 100_001, tableName: 'children' },
      Profile: { rowCount: 10, tableName: 'profiles' },
    })

    expect(
      pick({
        includeSpec: {
          children: { include: { profile: true }, take: 5 },
        },
        hasChildPagination: true,
      }),
    ).toBe('where-in')
  })

  it('keeps deep bounded child pagination correlated on SQLite', () => {
    expect(
      pick({
        includeSpec: { children: { include: { grands: true }, take: 5 } },
        hasChildPagination: true,
        dialect: 'sqlite',
      }),
    ).toBe('correlated')
  })

  it('keeps depth-three bounded child pagination correlated', () => {
    expect(
      pick({
        includeSpec: {
          children: {
            take: 5,
            include: {
              grands: { include: { greats: true } },
              _count: { select: { grands: true } },
            },
          },
        },
        hasChildPagination: true,
      }),
    ).toBe('correlated')
  })

  it('uses where-in for a tiny root page with deep relation filtering', () => {
    expect(
      pick({
        includeSpec: {
          children: {
            take: 5,
            include: {
              grands: { include: { greats: true } },
              _count: { select: { grands: true } },
            },
          },
        },
        args: {
          where: {
            children: {
              some: {
                grands: { some: { greats: { some: { id: 1 } } } },
              },
            },
          },
          take: 2,
        },
        takeValue: 2,
        hasChildPagination: true,
      }),
    ).toBe('where-in')
  })

  it('keeps deep pagination correlated when the root relation filter is shallow', () => {
    expect(
      pick({
        includeSpec: {
          children: {
            take: 5,
            include: {
              grands: { include: { greats: true } },
              _count: { select: { grands: true } },
            },
          },
        },
        args: { where: { children: { some: { id: 1 } } }, take: 2 },
        takeValue: 2,
        hasChildPagination: true,
      }),
    ).toBe('correlated')
  })

  it('finds deep relation filters inside logical arrays', () => {
    expect(
      pick({
        includeSpec: {
          children: {
            take: 5,
            include: {
              grands: { include: { greats: true } },
              _count: { select: { grands: true } },
            },
          },
        },
        args: {
          where: {
            OR: [
              { id: 1 },
              {
                children: {
                  some: {
                    AND: [
                      {
                        grands: {
                          some: { greats: { some: { id: 1 } } },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
          take: 2,
        },
        takeValue: 2,
        hasChildPagination: true,
      }),
    ).toBe('where-in')
  })

  it('keeps deep filtered pagination correlated for larger root pages', () => {
    expect(
      pick({
        includeSpec: {
          children: {
            take: 5,
            include: {
              grands: { include: { greats: true } },
              _count: { select: { grands: true } },
            },
          },
        },
        args: {
          where: {
            children: {
              some: {
                grands: { some: { greats: { some: { id: 1 } } } },
              },
            },
          },
          take: 3,
        },
        takeValue: 3,
        hasChildPagination: true,
      }),
    ).toBe('correlated')
  })

  it('keeps deep filtered pagination correlated without nested counts', () => {
    expect(
      pick({
        includeSpec: {
          children: {
            take: 5,
            include: { grands: { include: { greats: true } } },
          },
        },
        args: {
          where: {
            children: {
              some: {
                grands: { some: { greats: { some: { id: 1 } } } },
              },
            },
          },
          take: 2,
        },
        takeValue: 2,
        hasChildPagination: true,
      }),
    ).toBe('correlated')
  })

  it('keeps depth-two pagination with nested counts correlated', () => {
    expect(
      pick({
        includeSpec: {
          children: {
            take: 5,
            select: {
              id: true,
              _count: { select: { grands: true } },
              grands: true,
            },
          },
        },
        hasChildPagination: true,
      }),
    ).toBe('correlated')
  })

  it('keeps shallow child pagination with a where clause on where-in', () => {
    expect(
      pick({
        includeSpec: {
          children: { take: 5, where: { id: { gt: 1 } } },
        },
        hasChildPagination: true,
      }),
    ).toBe('where-in')
  })

  it('lets the cost model choose correlated for shallow bounded children', () => {
    expect(
      pick({
        includeSpec: { children: { take: 3 } },
        hasChildPagination: true,
      }),
    ).toBe('correlated')
  })

  it('uses flat join for one-to-one includes', () => {
    expect(
      pick({
        includeSpec: { profile: true },
        canFlatJoin: true,
      }),
    ).toBe('flat-join')
  })

  it('uses flat join for a single parent through depth two', () => {
    expect(
      pick({
        method: 'findUnique',
        canFlatJoin: true,
      }),
    ).toBe('flat-join')
  })

  it('runs the large-child guard before the paginated rule', () => {
    setModelStats({
      Root: { rowCount: 10, tableName: 'roots' },
      Child: { rowCount: 100_001, tableName: 'children' },
      Grand: { rowCount: 10, tableName: 'grands' },
      Great: { rowCount: 10, tableName: 'greats' },
    })

    expect(pick({ hasChildPagination: true })).toBe('where-in')
  })

  it('uses where-in for shallow pagination without model stats', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setModelStats({})

    expect(
      pick({
        includeSpec: { children: { take: 5 } },
        hasChildPagination: true,
      }),
    ).toBe('where-in')
    expect(warning).toHaveBeenCalledOnce()
    warning.mockRestore()
  })

  it('keeps deep bounded includes correlated without model stats', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setModelStats({})

    expect(pick({ hasChildPagination: true })).toBe('correlated')
    expect(warning).toHaveBeenCalledOnce()
    warning.mockRestore()
  })

  it('uses where-in when shallow child model stats are incomplete', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setModelStats({ Root: { rowCount: 10, tableName: 'roots' } })

    expect(
      pick({
        includeSpec: { children: { take: 5 } },
        hasChildPagination: true,
      }),
    ).toBe('where-in')
    expect(warning).toHaveBeenCalledOnce()
    warning.mockRestore()
  })

  it('does not suggest unsupported stats collection for SQLite', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setModelStats({})

    expect(
      pick({
        dialect: 'sqlite',
        includeSpec: { children: { take: 5 } },
        hasChildPagination: true,
      }),
    ).toBe('correlated')
    expect(warning).not.toHaveBeenCalled()
    warning.mockRestore()
  })
})
