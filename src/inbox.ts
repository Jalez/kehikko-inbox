import { INBOX_GO_LABEL, type InboxAdoptionResult, type InboxItem, type InboxKey, type InboxReadResult } from 'kehikot-module-protocol'

/**
 * The Inbox's rules, pure: which item goes in which section and in what order, what a row says,
 * what the footer counts, and what a small container shows. The page draws these; the tests read
 * them. Every string an item carries is the host's or a module's TEXT, never markup.
 */

/** Which items the header's filter shows: everything, or only what needs the person. */
export type Show = 'all' | 'needs'
export const SHOWS: readonly Show[] = ['all', 'needs']

/** Where they are from: everywhere in the project (the default), or this kehikko. */
export type Where = 'everywhere' | 'here'
export const WHERES: readonly Where[] = ['everywhere', 'here']

export interface Filter {
  show: Show
  where: Where
}

export const DEFAULT_FILTER: Filter = { show: 'all', where: 'everywhere' }

/** An item and, for one of another project's, that project (the host's number for it and its name). */
export interface Shown {
  item: InboxItem
  project?: { id: number; name: string }
}

/** The state of an item in words, used wherever its dot is drawn: never colour alone. */
export const STATE_WORDS: Record<InboxItem['state'], string> = {
  attention: 'needs you',
  working: 'working',
  done: 'finished',
}

/** What a row says after its by-line: the declared event's words, else the state's. */
/** What an offer to take the person somewhere says in place of its state (an item with `go`). */
export const OFFER_SAID = 'offers to show you'

export const stateSaid = (item: Pick<InboxItem, 'state' | 'says'> & { go?: InboxItem['go'] }): string =>
  item.go ? OFFER_SAID : item.says || STATE_WORDS[item.state]

/** The words on an item's go button: the host's `label`, else "Take me there". Text only. */
export const goWords = (item: Pick<InboxItem, 'go'>): string | null => (item.go ? item.go.label || INBOX_GO_LABEL : null)

const PRIORITY_RANK: Record<InboxItem['priority'], number> = { urgent: 0, normal: 1, low: 2 }

/** Urgent first, then the longest waiting. */
export function byPressing(a: InboxItem, b: InboxItem): number {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    a.entered - b.entered ||
    a.module.localeCompare(b.module) ||
    a.id.localeCompare(b.id)
  )
}

/** The newest first. */
export const newestFirst = (a: InboxItem, b: InboxItem): number =>
  b.entered - a.entered || a.module.localeCompare(b.module) || a.id.localeCompare(b.id)

/** One item's identity on this page: its module and id, and its project when it is another's. */
export const keyOf = (item: Pick<InboxItem, 'module' | 'id'>, project?: number): string =>
  `${project ?? ''}\u0001${item.module}\u0001${item.id}`

export interface Sections {
  needs: InboxItem[]
  working: InboxItem[]
  /** Finished and not yet seen. */
  finished: InboxItem[]
  /** Finished things the person has been to: no longer news, shown at the top of Earlier. */
  seen: InboxItem[]
}

export function sectionsOf(items: readonly InboxItem[]): Sections {
  return {
    needs: items.filter((one) => one.state === 'attention').sort(byPressing),
    working: items.filter((one) => one.state === 'working').sort(byPressing),
    finished: items.filter((one) => one.state === 'done' && !one.seen).sort(newestFirst),
    seen: items.filter((one) => one.state === 'done' && one.seen).sort(newestFirst),
  }
}

/** The heading of the group of items about the whole project, when the Inbox shows this kehikko. */
export const PROJECT_GROUP = 'This project'

export interface Arranged extends Sections {
  /** In "This kehikko", what is about the whole project, in its own group: needs, working, finished. */
  project: InboxItem[]
  /** The other projects with something to show, each with its items: what needs you, then working, then finished. */
  elsewhere: { project: { id: number; name: string }; items: InboxItem[] }[]
}

const ELSEWHERE_ORDER: Record<InboxItem['state'], number> = { attention: 0, working: 1, done: 2 }

/**
 * The Inbox as the filter shows it.
 *
 * - **This kehikko** (`where: 'here'`): the items that belong to this kehikko (`here`), and in
 *   their own group "This project" the ones about the whole project (`project`). Everywhere: all of
 *   them, in the sections.
 * - **Needs you only** (`show: 'needs'`): only what needs the person, here and in other projects;
 *   nothing working, finished or seen.
 * - Other projects' items (`elsewhere`) are shown whichever kehikko this is, under each project.
 */
export function arrange(read: Pick<InboxReadResult, 'items' | 'elsewhere'>, filter: Filter): Arranged {
  const wanted = (item: InboxItem) => filter.show === 'all' || item.state === 'attention'
  const items = read.items.filter(wanted)
  const grouping = filter.where === 'here'
  const mine = grouping ? items.filter((one) => one.here && !one.project) : items
  const s = sectionsOf(mine)
  const p = grouping ? sectionsOf(items.filter((one) => one.project)) : null
  const project = p ? [...p.needs, ...p.working, ...p.finished] : []
  const seen = grouping ? [...s.seen, ...(p?.seen ?? [])].sort(newestFirst) : s.seen
  const elsewhere = read.elsewhere
    .map(({ project: other, items: theirs }) => ({
      project: other,
      items: theirs
        .filter(wanted)
        .filter((one) => !(one.state === 'done' && one.seen))
        .sort((a, b) => ELSEWHERE_ORDER[a.state] - ELSEWHERE_ORDER[b.state] || (a.state === 'done' ? newestFirst(a, b) : byPressing(a, b))),
    }))
    .filter((one) => one.items.length > 0)
  return { ...s, seen: filter.show === 'all' ? seen : [], project, elsewhere }
}

/* ---- rows of one module, folded ---- */

/** How many rows of one module in one section are drawn before they fold into one. */
export const FOLD_FROM = 3

export interface Folded {
  head: InboxItem
  members: InboxItem[]
  key: string
}

/**
 * One module's repeats in a section folded into one row, in the order of their first member: a
 * module with `FOLD_FROM` rows or more there is drawn as one row that opens to them.
 */
export function fold(list: readonly InboxItem[], project?: number): Folded[] {
  /* An offer to take the person somewhere is its own row, never folded: its button is the point. */
  const count = new Map<string, number>()
  for (const item of list) if (!item.go) count.set(item.module, (count.get(item.module) ?? 0) + 1)
  const rows: Folded[] = []
  const at = new Map<string, Folded>()
  for (const item of list) {
    if (item.go || (count.get(item.module) ?? 0) < FOLD_FROM) {
      rows.push({ head: item, members: [item], key: keyOf(item, project) })
      continue
    }
    const there = at.get(item.module)
    if (there) {
      there.members.push(item)
      continue
    }
    const row: Folded = { head: item, members: [item], key: `fold:${project ?? ''}\u0001${item.module}\u0001${item.state}` }
    at.set(item.module, row)
    rows.push(row)
  }
  return rows
}

/* ---- words ---- */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "3 min ago", "2 h ago", "yesterday", "5 d ago". */
export function ageWords(now: number, at: number): string {
  const ms = Math.max(0, now - at)
  if (ms < MINUTE) return 'just now'
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`
  if (ms < 2 * DAY) return 'yesterday'
  return `${Math.floor(ms / DAY)} d ago`
}

/** A row's place: the host's words for it, and, for another project's item, that project first. */
export function placeSaid(item: Pick<InboxItem, 'where'>, project?: { name: string }): string {
  if (!project) return item.where
  if (!item.where || item.where === project.name) return project.name
  return `${project.name} · ${item.where}`
}

/** The go button's tooltip: where it takes the person, and that Go back returns them. */
export function goTitle(item: Pick<InboxItem, 'where' | 'go'>, project?: { name: string }): string {
  const where = placeSaid(item, project)
  return `${goWords(item) ?? INBOX_GO_LABEL}${where ? ` — ${where}` : ''}. Go back on the kehikko returns you.`
}

export const mutedWords = (count: number): string => `${count} ${count === 1 ? 'module' : 'modules'} muted`
export const stopWords = (by: string): string => `Stop showing ${by} here`
export const STOP_TITLE = 'Stops showing this module’s items in your Inbox everywhere; they are still kept, and the foot of the list shows it again'

/** What the Inbox says when a host does not answer it: one sentence, and nothing else is drawn. */
export const OLD_HOST =
  'This version of Kehikot keeps your Inbox in its own bar. Once Kehikot is updated, your Inbox shows here.'

/** What a `next` with nothing to go to says. */
export const NOTHING_NEEDS_YOU = 'Nothing needs you.'

/** Nothing to list: no section but Earlier has a row. */
export const isNothing = (arranged: Arranged): boolean =>
  arranged.needs.length + arranged.working.length + arranged.finished.length + arranged.project.length + arranged.elsewhere.length === 0

/** The line under "Nothing needs you": why the list is empty, by the filter and the scope. */
export function emptyWords({ filter, hiddenByFilter, moreElsewhere }: { filter: Filter; hiddenByFilter: boolean; moreElsewhere: boolean }): string {
  if (hiddenByFilter) return 'Only what needs you is shown. Other things are going on.'
  if (moreElsewhere) return 'Nothing on this kehikko. Switch Where to Everywhere to see the others.'
  return filter.where === 'here' ? 'Nothing on this kehikko right now.' : 'Nothing here right now.'
}

/* ---- counts, for the footer and a small container ---- */

export interface Tally {
  /** What needs the person in this project, as the filter's kehikko shows it. */
  needs: number
  working: number
  /** Finished and unseen. */
  finished: number
  /** What needs the person in their other projects. */
  elsewhere: number
}

export function tallyOf(arranged: Arranged): Tally {
  const project = sectionsOf(arranged.project)
  return {
    needs: arranged.needs.length + project.needs.length,
    working: arranged.working.length + project.working.length,
    finished: arranged.finished.length + project.finished.length,
    elsewhere: arranged.elsewhere.reduce((sum, one) => sum + one.items.filter((item) => item.state === 'attention').length, 0),
  }
}

/** "2 need you · 1 working · 1 in other projects", or "Nothing needs you" with what else is going on. */
export function tallySaid(tally: Tally): string {
  const said: string[] = []
  if (tally.needs) said.push(`${tally.needs} ${tally.needs === 1 ? 'needs' : 'need'} you`)
  if (tally.working) said.push(`${tally.working} working`)
  if (tally.finished) said.push(`${tally.finished} finished`)
  if (tally.elsewhere) said.push(`${tally.elsewhere} in other ${tally.elsewhere === 1 ? 'project' : 'projects'}`)
  if (!tally.needs && !tally.elsewhere) said.unshift('Nothing needs you')
  return said.join(' · ')
}

/** The item `next` names, with its project when it is another's; null when it is not in what was read. */
export function findItem(read: Pick<InboxReadResult, 'items' | 'elsewhere'>, key: InboxKey): Shown | null {
  const here = read.items.find((one) => one.module === key.module && one.id === key.id)
  if (here) return { item: here }
  for (const other of read.elsewhere) {
    const there = other.items.find((one) => one.module === key.module && one.id === key.id)
    if (there) return { item: there, project: other.project }
  }
  return null
}

/**
 * What a small container shows on its one line: what Next would go to, else the most pressing thing
 * the filter shows — needs you, then working, then finished, then another project's.
 */
export function topOf(read: Pick<InboxReadResult, 'items' | 'elsewhere' | 'next'>, arranged: Arranged): Shown | null {
  if (read.next) {
    const next = findItem(read, read.next)
    if (next) return next
  }
  const first = arranged.needs[0] ?? arranged.project.find((one) => one.state === 'attention') ?? arranged.working[0] ?? arranged.finished[0] ?? arranged.project[0]
  if (first) return { item: first }
  const other = arranged.elsewhere[0]
  return other?.items[0] ? { item: other.items[0], project: other.project } : null
}

/** A container this short or shorter, in CSS pixels, shows only the count and the top item. */
export const SMALL_BELOW = 96

/* ---- adopting an item no space names (protocol 2.88.0, 2.91.0) ---- */

/** One press an adoptable item offers. */
export type AdoptPress =
  | { kind: 'add'; label: string; epic: string; parts: string[] }
  | { kind: 'with'; label: string }
  | { kind: 'pick'; label: string }

/** What an adoptable item offers, from the host's `inbox.adoption`, before it is read and after. */
export interface AdoptOffer {
  /** The main press. */
  primary: AdoptPress
  /** The other way, when there is one. */
  secondary: AdoptPress | null
  /** A third, quieter way: the picker, beside a sure suggestion and the agent. */
  third?: AdoptPress | null
  /** Why the agent cannot help yet, in a line under the presses, when that is known. */
  hint?: string | null
}

/** How many adoptable items the page asks the host about at once, so a sure suggestion is one press. */
export const ADOPT_READ_FIRST = 3

export const UNTRACK_WORDS = "Don't track this"
export const UNDO_WORDS = 'Undo'

/**
 * What an adoptable item offers (protocol 2.88.0, 2.91.0). The agent of the person's kehikko is the way
 * by default, and where it cannot help yet the press is the fix — never only the picker:
 * - the kehikko's agent (its primary, or its only one): "Adopt with <agent>…";
 * - several there and none primary: "Adopt with an agent…" (the host asks which, and it becomes primary);
 * - an agent module there that needs updating first: "Update <name>…";
 * - no agent module there: "Add an agent module…", with a line saying why.
 * Each is `inbox.adoptWith`; the host takes the person where it leads. The picker ("Choose a space
 * myself…") stays a secondary way. An unambiguous suggestion is still "Add to <space>" in one press,
 * with the agent beside it. Before the host has said (`adoption` null), or from a host that says
 * nothing of agents: the picker. Never adopts by itself.
 */
export function adoptOffer(
  adoption: Pick<InboxAdoptionResult, 'suggested' | 'agent' | 'epics'> & Partial<Pick<InboxAdoptionResult, 'taskAgents' | 'agentsToUpdate'>> | null,
): AdoptOffer {
  if (!adoption) return { primary: { kind: 'pick', label: 'Choose a space…' }, secondary: null }
  let fix: AdoptPress | null = null
  let hint: string | null = null
  if (adoption.agent) fix = { kind: 'with', label: `Adopt with ${adoption.agent.name}…` }
  else if ((adoption.taskAgents?.length ?? 0) > 1) fix = { kind: 'with', label: 'Adopt with an agent…' }
  else if (adoption.agentsToUpdate?.length) {
    const name = adoption.agentsToUpdate[0]!.name
    fix = { kind: 'with', label: `Update ${name}…` }
    hint = `Update ${name} to let it find the right space.`
  } else if (adoption.taskAgents) {
    fix = { kind: 'with', label: 'Add an agent module…' }
    hint = 'Add an agent module to let it find the right space.'
  }
  const sure = adoption.suggested?.sure ? adoption.suggested : null
  const title = sure ? (adoption.epics.find((one) => one.epic === sure.epic)?.title ?? sure.epic) : null
  const myself: AdoptPress = { kind: 'pick', label: 'Choose a space myself…' }
  if (sure && title) {
    const add: AdoptPress = { kind: 'add', label: `Add to ${title}`, epic: sure.epic, parts: [...sure.parts] }
    return fix ? { primary: add, secondary: fix, third: myself, hint } : { primary: add, secondary: { kind: 'pick', label: 'Another space…' } }
  }
  if (fix) return { primary: fix, secondary: myself, hint }
  return { primary: { kind: 'pick', label: 'Choose a space…' }, secondary: null }
}
