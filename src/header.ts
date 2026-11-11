import { headerItemsSchema, type HeaderItem, type PressValue } from 'kehikot-module-protocol'

import { SHOWS, WHERES, type Filter, type Show, type Where } from './inbox.ts'

/**
 * The Inbox's header (`kehikot.header`): how it is set up, which is what it shows. Two switches,
 * the module's own state, kept per container by the client's kept view. A count is never in a
 * label: that is the footer's.
 */
export function headerItems(filter: Filter, tooOld = false): HeaderItem[] {
  if (tooOld) return headerItemsSchema.parse([])
  return headerItemsSchema.parse([
    {
      kind: 'switch',
      id: 'show',
      label: 'Show',
      value: filter.show,
      options: [
        { id: 'all', label: 'Everything' },
        { id: 'needs', label: 'Needs you only' },
      ],
      agents: true,
    },
    {
      kind: 'switch',
      id: 'where',
      label: 'Where',
      value: filter.where,
      options: [
        { id: 'everywhere', label: 'Everywhere' },
        { id: 'here', label: 'This kehikko' },
      ],
      agents: true,
    },
  ])
}

/** A header press, as the new filter or the sentence that refuses it. */
export function pressHeader(filter: Filter, item: string, value: PressValue | undefined): Filter | string {
  if (item === 'show') {
    if (typeof value === 'string' && (SHOWS as readonly string[]).includes(value)) return { ...filter, show: value as Show }
    return 'Show is Everything or Needs you only.'
  }
  if (item === 'where') {
    if (typeof value === 'string' && (WHERES as readonly string[]).includes(value)) return { ...filter, where: value as Where }
    return 'Where is Everywhere or This kehikko.'
  }
  return `Inbox has nothing called "${item.slice(0, 40)}" to press.`
}
