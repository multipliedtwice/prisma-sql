import { expect } from 'vitest'
import type { TestDB } from './db'
import { runParityTest, type BenchmarkResult } from './benchmark-utils'
import { withExtensionCapture } from './query-capture'

export interface ParityCase {
  name: string
  model: string
  args: Record<string, unknown> & { method: string }
  sortField?: string
}

const NOT_DONE_NOT_HIGH = [{ status: 'DONE' }, { priority: 'HIGH' }]

export const NOT_ARRAY_AND_COUNT_WHERE_CASES: readonly ParityCase[] = [
  {
    name: 'NOT array excludes each condition independently',
    model: 'Task',
    args: {
      method: 'findMany',
      where: { NOT: NOT_DONE_NOT_HIGH },
      select: { id: true, status: true, priority: true },
      orderBy: { id: 'asc' },
    },
  },
  {
    name: 'NOT array beside scalar filters',
    model: 'Task',
    args: {
      method: 'findMany',
      where: {
        NOT: [{ status: 'CANCELLED' }, { priority: 'LOW' }],
        completedAt: null,
      },
      select: { id: true, status: true, priority: true },
      orderBy: { id: 'asc' },
    },
  },
  {
    name: 'NOT array with nested AND element',
    model: 'Task',
    args: {
      method: 'findMany',
      where: {
        NOT: [
          { AND: [{ status: 'TODO' }, { priority: 'MEDIUM' }] },
          { status: 'DONE' },
        ],
      },
      select: { id: true, status: true, priority: true },
      orderBy: { id: 'asc' },
    },
  },
  {
    name: 'NOT array inside nested relation where',
    model: 'Project',
    args: {
      method: 'findMany',
      select: {
        id: true,
        tasks: {
          where: { NOT: NOT_DONE_NOT_HIGH },
          select: { id: true, status: true, priority: true },
          orderBy: { id: 'asc' },
        },
      },
      take: 10,
      orderBy: { id: 'asc' },
    },
  },
  {
    name: 'NOT array in count',
    model: 'Task',
    args: {
      method: 'count',
      where: { NOT: NOT_DONE_NOT_HIGH },
    },
    sortField: '',
  },
  {
    name: 'NOT array in groupBy having',
    model: 'Task',
    args: {
      method: 'groupBy',
      by: ['status', 'priority'],
      _count: { _all: true },
      having: {
        NOT: [
          { status: { _count: { gte: 5 } } },
          { priority: { _count: { lte: 2 } } },
        ],
      },
      orderBy: [{ status: 'asc' }, { priority: 'asc' }],
    },
    sortField: '',
  },
  {
    name: '_count relation where',
    model: 'Project',
    args: {
      method: 'findMany',
      select: {
        id: true,
        _count: { select: { tasks: { where: { status: 'DONE' } } } },
      },
      orderBy: { id: 'asc' },
    },
  },
  {
    name: '_count relation where with NOT array',
    model: 'Project',
    args: {
      method: 'findMany',
      select: {
        id: true,
        _count: {
          select: {
            tasks: { where: { NOT: NOT_DONE_NOT_HIGH } },
            milestones: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    },
  },
  {
    name: '_count relation where through relation filter',
    model: 'Project',
    args: {
      method: 'findMany',
      select: {
        id: true,
        _count: {
          select: {
            tasks: { where: { assignee: { is: { status: 'ACTIVE' } } } },
          },
        },
      },
      orderBy: { id: 'asc' },
    },
  },
  {
    name: '_count relation where on mapped column',
    model: 'Organization',
    args: {
      method: 'findMany',
      select: {
        id: true,
        _count: {
          select: {
            members: { where: { user: { is: { avatarUrl: { not: null } } } } },
          },
        },
      },
      orderBy: { id: 'asc' },
    },
  },
  {
    name: '_count relation where in include',
    model: 'Project',
    args: {
      method: 'findMany',
      include: {
        _count: { select: { tasks: { where: { status: 'TODO' } } } },
      },
      take: 5,
      orderBy: { id: 'asc' },
    },
  },
  {
    name: '_count relation where alongside main where params',
    model: 'Project',
    args: {
      method: 'findMany',
      where: { status: { not: 'ARCHIVED' } },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            tasks: { where: { priority: 'HIGH', status: { not: 'DONE' } } },
          },
        },
      },
      orderBy: { id: 'asc' },
    },
  },
  {
    name: '_count relation where inside nested relation select',
    model: 'Organization',
    args: {
      method: 'findMany',
      select: {
        id: true,
        projects: {
          select: {
            id: true,
            _count: { select: { tasks: { where: { priority: 'URGENT' } } } },
          },
          where: { status: 'ACTIVE' },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    },
  },
  {
    name: '_count relation where on findFirst',
    model: 'Project',
    args: {
      method: 'findFirst',
      where: { tasks: { some: {} } },
      select: {
        id: true,
        _count: { select: { tasks: { where: { status: 'IN_PROGRESS' } } } },
      },
      orderBy: { id: 'asc' },
    },
    sortField: '',
  },
]

function accessorFor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

export async function runNotArrayCountWhereCase(
  db: TestDB,
  benchmarkResults: BenchmarkResult[],
  parityCase: ParityCase,
): Promise<void> {
  const { method, ...queryArgs } = parityCase.args
  const accessor = accessorFor(parityCase.model)

  const captured = await withExtensionCapture(() =>
    db.extended[accessor][method](queryArgs),
  )
  expect(captured.queries.length).toBeGreaterThan(0)

  await runParityTest(
    db,
    benchmarkResults,
    parityCase.name,
    parityCase.model,
    parityCase.args,
    () => db.prisma[accessor][method](queryArgs),
    { benchmark: false, sortField: parityCase.sortField ?? 'id' },
  )
}
