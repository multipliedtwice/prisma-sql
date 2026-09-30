import { describe, expect, it } from 'vitest'
import type { WhereInSegment } from '../../src/builder/select/segment-planner'
import {
  applyPerParentSlice,
  buildParentKeyIndex,
  compositeKey,
  stitchChildrenToParents,
} from '../../src/builder/shared/where-in-utils'

function segment(
  perParentTake: number,
  perParentSkip = 0,
): WhereInSegment {
  return {
    relationName: 'children',
    relArgs: {},
    childModelName: 'Child',
    fkFieldNames: ['parentId'],
    parentKeyFieldNames: ['id'],
    isList: true,
    perParentTake,
    perParentSkip,
  }
}

describe('where-in per-parent pagination', () => {
  it('keeps scalar key types distinct', () => {
    expect(compositeKey([1])).not.toBe(compositeKey(['1']))
    expect(compositeKey([1n])).not.toBe(compositeKey(['1']))
    expect(compositeKey([true])).not.toBe(compositeKey(['true']))
  })

  it('slices every parent before stitching', () => {
    const parents = [{ id: 1 }, { id: 2 }]
    const children = [
      { id: 11, parentId: 1 },
      { id: 12, parentId: 1 },
      { id: 13, parentId: 1 },
      { id: 21, parentId: 2 },
      { id: 22, parentId: 2 },
      { id: 23, parentId: 2 },
    ]
    const paginated = segment(1, 1)
    const retained = applyPerParentSlice(children, paginated)

    expect(retained.map((child) => child.id)).toEqual([12, 22])

    stitchChildrenToParents(
      retained,
      paginated,
      buildParentKeyIndex(parents, ['id']),
      true,
    )
    expect(parents).toEqual([
      { id: 1, children: [{ id: 12, parentId: 1 }] },
      { id: 2, children: [{ id: 22, parentId: 2 }] },
    ])
  })

  it('preserves negative-take semantics for every parent', () => {
    const children = [
      { id: 11, parentId: 1 },
      { id: 12, parentId: 1 },
      { id: 13, parentId: 1 },
      { id: 21, parentId: 2 },
      { id: 22, parentId: 2 },
      { id: 23, parentId: 2 },
    ]

    expect(
      applyPerParentSlice(children, segment(-1, 1)).map((child) => child.id),
    ).toEqual([12, 22])
  })
})
