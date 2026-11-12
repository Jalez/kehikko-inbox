import { describe, expect, test } from 'bun:test'

import { arrange, findItem, fold, placeSaid, tallyOf, tallySaid, topOf, ageWords, FOLD_FROM } from '../src/inbox.ts'
import { item, readOf } from './fixtures.ts'

const ids = (list: { id: string }[]) => list.map((one) => one.id)

describe('the sections and their order', () => {
  test('Needs you: urgent first, then the longest waiting', () => {
    const read = readOf({
      items: [
        item({ id: 'new', entered: 3_000 }),
        item({ id: 'old', entered: 1_000 }),
        item({ id: 'urgent', entered: 5_000, priority: 'urgent' }),
        item({ id: 'low', entered: 500, priority: 'low' }),
      ],
    })
    expect(ids(arrange(read, { show: 'all', where: 'everywhere' }).needs)).toEqual(['urgent', 'old', 'new', 'low'])
  })

  test('Working by the same rule; Finished is the unseen ones, newest first; the seen go to Earlier', () => {
    const read = readOf({
      items: [
        item({ id: 'w2', state: 'working', entered: 2_000 }),
        item({ id: 'w1', state: 'working', entered: 1_000 }),
        item({ id: 'd-old', state: 'done', entered: 1_000 }),
        item({ id: 'd-new', state: 'done', entered: 4_000 }),
        item({ id: 'd-seen', state: 'done', seen: true }),
      ],
    })
    const s = arrange(read, { show: 'all', where: 'everywhere' })
    expect(ids(s.working)).toEqual(['w1', 'w2'])
    expect(ids(s.finished)).toEqual(['d-new', 'd-old'])
    expect(ids(s.seen)).toEqual(['d-seen'])
  })

  test('This kehikko: only what belongs here, and what is about the whole project in its own group', () => {
    const read = readOf({
      items: [
        item({ id: 'here' }),
        item({ id: 'there', here: false }),
        item({ id: 'project', project: true, where: 'Kehikot' }),
        item({ id: 'project-working', project: true, state: 'working' }),
      ],
    })
    const everywhere = arrange(read, { show: 'all', where: 'everywhere' })
    expect(ids(everywhere.needs).sort()).toEqual(['here', 'project', 'there'])
    expect(everywhere.project).toEqual([])
    const here = arrange(read, { show: 'all', where: 'here' })
    expect(ids(here.needs)).toEqual(['here'])
    expect(ids(here.project)).toEqual(['project', 'project-working'])
  })

  test('Needs you only: nothing working, finished or seen, here or in other projects', () => {
    const read = readOf({
      items: [item({ id: 'a' }), item({ id: 'w', state: 'working' }), item({ id: 'd', state: 'done' }), item({ id: 's', state: 'done', seen: true })],
      elsewhere: [{ project: { id: 2, name: 'Other' }, items: [item({ id: 'o-w', state: 'working' }), item({ id: 'o-a' })] }],
    })
    const s = arrange(read, { show: 'needs', where: 'everywhere' })
    expect(ids(s.needs)).toEqual(['a'])
    expect(s.working).toEqual([])
    expect(s.finished).toEqual([])
    expect(s.seen).toEqual([])
    expect(s.elsewhere.map((one) => ids(one.items))).toEqual([['o-a']])
  })

  test('another project: what needs you, then working, then finished; empty projects are left out', () => {
    const read = readOf({
      elsewhere: [
        { project: { id: 2, name: 'Other' }, items: [item({ id: 'd', state: 'done' }), item({ id: 'w', state: 'working' }), item({ id: 'a' })] },
        { project: { id: 3, name: 'Quiet' }, items: [item({ id: 'seen', state: 'done', seen: true })] },
      ],
    })
    const s = arrange(read, { show: 'all', where: 'here' })
    expect(s.elsewhere).toHaveLength(1)
    expect(ids(s.elsewhere[0]!.items)).toEqual(['a', 'w', 'd'])
  })
})

describe('one module’s repeats fold', () => {
  test(`from ${FOLD_FROM} rows of one module, into one row in the order of the first`, () => {
    const list = [
      item({ id: 'a1', module: 'm.a' }),
      item({ id: 'b1', module: 'm.b' }),
      item({ id: 'a2', module: 'm.a' }),
      item({ id: 'a3', module: 'm.a' }),
      item({ id: 'b2', module: 'm.b' }),
    ]
    const rows = fold(list)
    expect(rows.map((row) => ids(row.members))).toEqual([['a1', 'a2', 'a3'], ['b1'], ['b2']])
  })
})

describe('words', () => {
  test('the count says what needs you, what is working and what finished', () => {
    expect(tallySaid({ needs: 2, working: 1, finished: 0, elsewhere: 0 })).toBe('2 need you · 1 working')
    expect(tallySaid({ needs: 1, working: 0, finished: 3, elsewhere: 1 })).toBe('1 needs you · 3 finished · 1 in other project')
    expect(tallySaid({ needs: 0, working: 0, finished: 0, elsewhere: 0 })).toBe('Nothing needs you')
    expect(tallySaid({ needs: 0, working: 2, finished: 0, elsewhere: 0 })).toBe('Nothing needs you · 2 working')
  })

  test('the tally counts the project group too, and other projects’ needs', () => {
    const read = readOf({
      items: [item({ id: 'a' }), item({ id: 'p', project: true }), item({ id: 'w', state: 'working' })],
      elsewhere: [{ project: { id: 2, name: 'Other' }, items: [item({ id: 'o' }), item({ id: 'ow', state: 'working' })] }],
    })
    expect(tallyOf(arrange(read, { show: 'all', where: 'here' }))).toEqual({ needs: 2, working: 1, finished: 0, elsewhere: 1 })
  })

  test('a place: the host’s words, with another project’s name first', () => {
    expect(placeSaid({ where: 'part 1 · Wide' })).toBe('part 1 · Wide')
    expect(placeSaid({ where: 'part 1 · Wide' }, { name: 'Other' })).toBe('Other · part 1 · Wide')
    expect(placeSaid({ where: 'Other' }, { name: 'Other' })).toBe('Other')
  })

  test('ages', () => {
    expect(ageWords(10_000, 9_000)).toBe('just now')
    expect(ageWords(3 * 60_000, 0)).toBe('3 min ago')
    expect(ageWords(2 * 3_600_000, 0)).toBe('2 h ago')
    expect(ageWords(30 * 3_600_000, 0)).toBe('yesterday')
    expect(ageWords(5 * 86_400_000, 0)).toBe('5 d ago')
  })
})

describe('what a small container shows, and what Next names', () => {
  test('the top item is what Next names, with its project when it is another’s', () => {
    const read = readOf({
      items: [item({ id: 'a' })],
      elsewhere: [{ project: { id: 2, name: 'Other' }, items: [item({ id: 'o' })] }],
      next: { module: 'kehikot.claude', id: 'o' },
    })
    const top = topOf(read, arrange(read, { show: 'all', where: 'everywhere' }))
    expect(top?.item.id).toBe('o')
    expect(top?.project).toEqual({ id: 2, name: 'Other' })
    expect(findItem(read, { module: 'kehikot.claude', id: 'missing' })).toBeNull()
  })

  test('without a next: what needs you, else what is working', () => {
    const read = readOf({ items: [item({ id: 'w', state: 'working' }), item({ id: 'a', entered: 9_000 })] })
    expect(topOf(read, arrange(read, { show: 'all', where: 'everywhere' }))?.item.id).toBe('a')
    const quiet = readOf({ items: [item({ id: 'w', state: 'working' })] })
    expect(topOf(quiet, arrange(quiet, { show: 'all', where: 'everywhere' }))?.item.id).toBe('w')
    expect(topOf(readOf(), arrange(readOf(), { show: 'all', where: 'everywhere' }))).toBeNull()
  })
})

describe('an offer (go)', () => {
  test('its words: the host’s label, else Take me there; its state is said as an offer', async () => {
    const { goWords, stateSaid, fold } = await import('../src/inbox.ts')
    const { item } = await import('./fixtures.ts')
    const offer = item({ id: 'offer:1', state: 'done', go: {} })
    expect(goWords(offer)).toBe('Take me there')
    expect(goWords(item({ id: 'o2', go: { label: 'Show me' } }))).toBe('Show me')
    expect(goWords(item({ id: 'plain' }))).toBeNull()
    expect(stateSaid(offer)).toBe('offers to show you')
    /* Never folded with the module's other rows: its button is the point. */
    const many = [1, 2, 3, 4, 5].map((n) => item({ id: `d${n}`, state: 'done' }))
    const rows = fold([...many, offer])
    expect(rows.find((one) => one.head.id === 'offer:1')?.members).toHaveLength(1)
    expect(rows.find((one) => one.head.id !== 'offer:1')?.members.length).toBe(5)
  })
})
