import { footerItemsSchema, type FooterItem } from 'kehikot-module-protocol'

import { NOTHING_NEEDS_YOU, OLD_HOST, tallySaid, type Tally } from './inbox.ts'

/**
 * The Inbox's footer (`kehikot.footer`), in a host that draws one: what is going on now — the
 * count — and Next beside it, which acts on that count. A container folded to its header and
 * footer still says how many things need the person and still goes to the next one.
 */
export interface FooterState {
  /** The counts, or null before the first read. */
  tally: Tally | null
  /** Whether there is something for Next to go to. */
  next: boolean
  /** What went wrong reading the Inbox, or null. */
  trouble: string | null
  tooOld?: boolean
}

const cut = (text: string, most: number) => (text.length > most ? `${text.slice(0, most - 1)}…` : text)

export function footerItems({ tally, next, trouble, tooOld = false }: FooterState): FooterItem[] {
  if (tooOld) return footerItemsSchema.parse([{ kind: 'text', id: 'count', text: 'Your Inbox is in Kehikot’s bar', tooltip: OLD_HOST }])
  const items: unknown[] = []
  if (trouble) items.push({ kind: 'text', id: 'trouble', text: cut(trouble, 120), level: 'critical', tooltip: cut(trouble, 400) })
  if (!tally) {
    if (!trouble) items.push({ kind: 'text', id: 'count', text: 'Reading your Inbox…' })
    return footerItemsSchema.parse(items)
  }
  const said = tallySaid(tally)
  items.push({ kind: 'text', id: 'count', text: cut(said, 120), level: tally.needs ? 'warn' : 'normal', tooltip: cut(`${said}.`, 400) })
  items.push({
    kind: 'run',
    id: 'next',
    label: 'Next',
    actsOn: 'count',
    align: 'end',
    disabled: next ? null : NOTHING_NEEDS_YOU,
    tooltip: 'Go to the next thing that needs you (Alt+Shift+N)',
  })
  return footerItemsSchema.parse(items)
}
