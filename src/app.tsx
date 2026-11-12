import { BellOff, ChevronDown, ChevronRight, Inbox as InboxIcon } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'

import type { InboxItem, InboxKey, InboxLogResult, InboxReadResult, PressValue } from 'kehikot-module-protocol'
import { Cover, coverFor, useServerStanding } from 'kehikot-module-protocol/client/react'
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from 'kehikot-module-protocol/client/ui'

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ATTENTION, Dot, Question, Ring, Row, SectionHeading, type Answered, type Said } from '@/components/parts'
import { footerItems } from '@/footer'
import { headerItems, pressHeader } from '@/header'
import {
  DEFAULT_FILTER,
  NOTHING_NEEDS_YOU,
  OLD_HOST,
  PROJECT_GROUP,
  SMALL_BELOW,
  STOP_TITLE,
  ageWords,
  arrange,
  emptyWords,
  findItem,
  isNothing,
  fold,
  keyOf,
  mutedWords,
  goTitle,
  goWords,
  placeSaid,
  stateSaid,
  stopWords,
  tallyOf,
  tallySaid,
  topOf,
  type Arranged,
  type Filter,
} from '@/inbox'
import { answersNoInbox, inboxApi, isTooOld, sentence, type InboxApi } from '@/wire/inbox-api'
import { useKehikot, type Host } from '@/wire/use-kehikot'

/** A `kehikot.inbox` the host sent, numbered so the same signal twice is two. */
export interface Signal {
  kind: 'changed' | 'next'
  next: InboxKey | null
  n: number
}

/** What a press in the host's footer reaches in the screen. */
export type Presses = MutableRefObject<{ next(): void } | null>

type After = (done: Promise<{ outcome: string; why: string }>, taken: string) => Promise<void>

/** The page: the host's one record of what modules need, are doing and have said, read and acted on for the person. */
export function App() {
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER)
  const [signal, setSignal] = useState<Signal | null>(null)
  const presses: Presses = useRef(null)
  const filterNow = useRef(filter)
  filterNow.current = filter

  /* One handler for the header's switches (the person's, or the kept view putting them back) and the footer's Next. */
  const onPress = ({ item, value }: { item: string; value?: PressValue }) => {
    if (item === 'next') {
      presses.current?.next()
      return
    }
    const got = pressHeader(filterNow.current, item, value)
    if (typeof got === 'string') return got
    filterNow.current = got
    setFilter(got)
  }
  const onInbox = ({ kind, next }: { kind: 'changed' | 'next'; next: InboxKey | null }) =>
    setSignal((was) => ({ kind, next, n: (was?.n ?? 0) + 1 }))
  const host = useKehikot({ onPress, onInbox })
  const api = useMemo(() => inboxApi(host.request), [host.request])

  return <Screen host={host} api={api} filter={filter} onFilter={setFilter} signal={signal} presses={presses} />
}

const PAGE = 20

export function Screen({
  host,
  api,
  filter,
  onFilter = () => {},
  signal = null,
  presses,
  now = () => Date.now(),
  box: given,
}: {
  host: Host
  api: InboxApi
  filter: Filter
  onFilter?: (filter: Filter) => void
  signal?: Signal | null
  presses?: Presses
  now?: () => number
  /** The page's height, when a test says it; else measured. */
  box?: { height: number }
}) {
  const root = useRef<HTMLDivElement>(null)
  const measured = useHeight(root)
  const height = given?.height ?? measured
  const small = height !== null && height < SMALL_BELOW

  const server = useServerStanding()
  const cover = coverFor({ ...host, server }, { project: true })
  const [read, setRead] = useState<InboxReadResult | null>(null)
  const readNow = useRef(read)
  readNow.current = read
  const [trouble, setTrouble] = useState<string | null>(null)
  const [tooOldSaid, setTooOld] = useState(false)
  const tooOld = tooOldSaid || answersNoInbox(host.answers)
  /* What the last act came to when it was not done — the host's sentence — or "Nothing needs you". */
  const [said, setSaid] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const hosted = host.where === 'hosted'

  const reread = useCallback(() => {
    api.read().then(
      (got) => {
        setRead(got)
        setTrouble(null)
      },
      (error: unknown) => {
        if (isTooOld(error)) setTooOld(true)
        else setTrouble(sentence(error))
      },
    )
  }, [api])

  /* Read on the greeting, and again in another project. */
  useEffect(() => {
    if (hosted && !answersNoInbox(host.answers)) reread()
  }, [hosted, host.projectPath, host.answers, reread])

  /* And whenever the page is shown again: by the host (`kehikot.visible`) or by the browser. */
  const visible = host.visible ?? true
  const wasVisible = useRef(visible)
  useEffect(() => {
    if (visible && !wasVisible.current && hosted) reread()
    wasVisible.current = visible
  }, [visible, hosted, reread])
  useEffect(() => {
    if (!hosted) return
    const shown = () => {
      if (document.visibilityState === 'visible') reread()
    }
    document.addEventListener('visibilitychange', shown)
    return () => document.removeEventListener('visibilitychange', shown)
  }, [hosted, reread])

  /** Say what an act came to when it was not taken, and read the record again. */
  const after: After = useCallback(
    (done, taken) =>
      done.then(
        (got) => {
          setSaid(got.outcome === taken ? null : got.why || 'Kehikot did not do that.')
          reread()
        },
        (error: unknown) => setSaid(sentence(error)),
      ),
    [reread],
  )

  /** Go to an item: the host goes to its place. Called from a press, or for a host's `next`. */
  const open = useCallback(
    (key: InboxKey, project?: number) => {
      setHighlight(keyOf(key, project))
      void after(api.open({ module: key.module, id: key.id }, project), 'opened')
    },
    [api, after],
  )

  /** Next: what the host says needs the person first, or "Nothing needs you". */
  const goNext = useCallback(
    (key: InboxKey | null) => {
      if (!key) {
        setHighlight(null)
        setSaid(NOTHING_NEEDS_YOU)
        return
      }
      const found = readNow.current ? findItem(readNow.current, key) : null
      open(key, found?.project?.id)
    },
    [open],
  )

  /* The footer's Next, pressed in the host's footer: the next thing as last read. */
  useEffect(() => {
    if (!presses) return
    presses.current = { next: () => goNext(readNow.current?.next ?? null) }
    return () => {
      presses.current = null
    }
  }, [presses, goNext])

  /* What the host said: the record changed (read it again), or the person pressed its shortcut for
     the next thing that needs them (go to it now, inside the host's few seconds). Each signal once. */
  const handled = useRef(0)
  useEffect(() => {
    if (!signal || handled.current === signal.n) return
    handled.current = signal.n
    if (signal.kind === 'changed') reread()
    else goNext(signal.next)
  }, [signal, reread, goNext])

  /* The highlighted row is scrolled to, and the highlight goes after a moment. */
  useEffect(() => {
    if (!highlight) return
    const row = [...document.querySelectorAll<HTMLElement>('[data-key]')].find((one) => one.dataset.key === highlight)
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
    const timer = setTimeout(() => setHighlight(null), 6000)
    return () => clearTimeout(timer)
  }, [highlight])

  const arranged = useMemo(() => (read ? arrange(read, filter) : null), [read, filter])
  const tally = useMemo(() => (arranged ? tallyOf(arranged) : null), [arranged])

  /* The header: the filter, declared again whenever it changes; nothing on a host that cannot answer. */
  const { header } = host
  const items = useMemo(() => headerItems(filter, tooOld), [filter, tooOld])
  useEffect(() => header(items), [header, items])

  /* The footer the host draws: the count and Next beside it. */
  const drawsFooter = hosted && host.drawsFooter === true
  const footerSaid = drawsFooter && !cover ? JSON.stringify(footerItems({ tally, next: Boolean(read?.next), trouble, tooOld })) : null
  const { footer } = host
  useEffect(() => {
    if (footerSaid) footer?.(JSON.parse(footerSaid))
  }, [footer, footerSaid])

  /* The host's cover comes off once the page has drawn what it shows: the record, why it could not
     be read, or the sentence for a host that does not answer it. */
  const drawn = read !== null || trouble !== null || tooOld || cover === 'down' || cover === 'stale'
  const { ready } = host
  useEffect(() => {
    if (drawn) ready?.()
  }, [ready, drawn])

  return (
    <div data-kehikot-page ref={root} className="flex h-screen min-w-0 flex-col text-sm" data-small={small ? '' : undefined}>
      {cover ? (
        <Cover state={cover} name="Inbox" onRetry={reread} />
      ) : tooOld ? (
        <div data-old-host="" className="flex min-h-0 flex-1 flex-col">
          <Cover state="empty" name="Inbox">
            {OLD_HOST}
          </Cover>
        </div>
      ) : small ? (
        <Small read={read} arranged={arranged} trouble={trouble} said={said} highlight={highlight} onOpen={open} />
      ) : (
        <>
          <main data-kehikot-scroll className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pb-1">
            {said ? (
              <p role="status" data-said="" className="text-muted-foreground px-2 pt-1.5 text-xs">
                {said}
              </p>
            ) : null}
            {trouble && !drawsFooter ? (
              <p role="alert" data-trouble="" className="text-destructive px-2 pt-1.5 text-xs">
                {trouble}
              </p>
            ) : null}
            {read && arranged ? (
              <List read={read} arranged={arranged} filter={filter} onFilter={onFilter} api={api} now={now} highlight={highlight} onOpen={open} after={after} setSaid={setSaid} />
            ) : null}
          </main>
          {!drawsFooter && tally ? (
            <footer className="flex shrink-0 items-center gap-2 border-t px-2 py-1 text-xs" data-own-footer="">
              <span className={cn('min-w-0 flex-1 truncate', tally.needs ? ATTENTION : 'text-muted-foreground')}>{tallySaid(tally)}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                disabled={!read?.next}
                title="Go to the next thing that needs you (Alt+Shift+N)"
                onClick={() => goNext(read?.next ?? null)}
              >
                Next
              </Button>
            </footer>
          ) : null}
        </>
      )}
    </div>
  )
}

/** A container one or two rows high: the count, and the top item on one pressable line. */
function Small({
  read,
  arranged,
  trouble,
  said,
  highlight,
  onOpen,
}: {
  read: InboxReadResult | null
  arranged: Arranged | null
  trouble: string | null
  said: string | null
  highlight: string | null
  onOpen(key: InboxKey, project?: number): void
}) {
  if (!read || !arranged) {
    return trouble ? (
      <p role="alert" className="text-destructive truncate px-2 py-1 text-xs">
        {trouble}
      </p>
    ) : null
  }
  const tally = tallyOf(arranged)
  const top = topOf(read, arranged)
  const key = top ? keyOf(top.item, top.project?.id) : null
  return (
    <div className="flex min-w-0 items-center gap-2 px-2 py-1 text-xs" data-small-line="" title={said ?? undefined}>
      <span className={cn('shrink-0 tabular-nums', tally.needs ? ATTENTION : 'text-muted-foreground')} data-small-count="">
        {tallySaid(tally)}
      </span>
      {top && top.item.go ? (
        <span className="flex min-w-0 flex-1 items-center gap-1.5" data-key={key} data-highlighted={highlight === key ? '' : undefined}>
          <Dot state={top.item.state} />
          <span className="text-muted-foreground shrink-0">
            {top.item.by} · {stateSaid(top.item)}
          </span>
          <span className="min-w-0 flex-1 truncate" title={top.item.label}>
            {top.item.label}
          </span>
          <Button
            type="button"
            size="sm"
            data-go=""
            title={goTitle(top.item, top.project)}
            className="h-5 max-w-32 shrink-0 truncate px-1.5 text-[11px]"
            onClick={() => onOpen(top.item, top.project?.id)}
          >
            {goWords(top.item)}
          </Button>
        </span>
      ) : top ? (
        <button
          type="button"
          data-key={key}
          data-highlighted={highlight === key ? '' : undefined}
          title={`${top.item.by} · ${stateSaid(top.item)}: ${top.item.label}`}
          className="hover:bg-accent/60 focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-sm px-1 text-left outline-none focus-visible:ring-[3px]"
          onClick={() => onOpen(top.item, top.project?.id)}
        >
          <Dot state={top.item.state} />
          <span className="text-muted-foreground shrink-0">
            {top.item.by} · {stateSaid(top.item)}
          </span>
          <span className="min-w-0 truncate">{top.item.label}</span>
        </button>
      ) : null}
    </div>
  )
}

function List({
  read,
  arranged,
  filter,
  onFilter,
  api,
  now: clock,
  highlight,
  onOpen,
  after,
  setSaid,
}: {
  read: InboxReadResult
  arranged: Arranged
  filter: Filter
  onFilter(filter: Filter): void
  api: InboxApi
  now: () => number
  highlight: string | null
  onOpen(key: InboxKey, project?: number): void
  after: After
  setSaid(said: string | null): void
}) {
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set())
  const [mutedOpen, setMutedOpen] = useState(false)
  /* Ages tick. */
  const [now, setNow] = useState(clock)
  useEffect(() => {
    setNow(clock())
    const timer = setInterval(() => setNow(clock()), 30_000)
    return () => clearInterval(timer)
  }, [clock, read])

  const dismiss = (items: readonly InboxItem[], project?: number) =>
    void after(api.act({ do: 'dismiss', keys: items.map(({ module, id }) => ({ module, id })), ...(project === undefined ? {} : { project }) }), 'done')
  const mute = (item: InboxItem) =>
    item.mutable ? { mute: { label: stopWords(item.by), title: STOP_TITLE, run: () => void after(api.use(item.module, false), 'done') } } : {}
  const answer = (item: InboxItem, said: Said, project?: number): Promise<Answered> =>
    api.answer({ module: item.module, id: item.id }, said, project).then(
      (got): Answered => (got.outcome === 'sent' ? { ok: true } : { ok: false, why: got.why || 'Kehikot did not send it.' }),
      (error: unknown): Answered => ({ ok: false, why: sentence(error) }),
    )

  const row = (item: InboxItem, project?: { id: number; name: string }, member = false) => {
    const key = keyOf(item, project?.id)
    return (
      <Row
        key={`${member ? 'member:' : ''}${key}`}
        rowKey={key}
        dot={<Dot state={item.state} />}
        by={item.by}
        state={stateSaid(item)}
        label={item.label}
        {...(item.detail ? { detail: item.detail } : {})}
        place={placeSaid(item, project)}
        age={ageWords(now, item.entered)}
        urgent={item.priority === 'urgent'}
        highlighted={highlight === key}
        onPress={() => onOpen(item, project?.id)}
        {...(item.go ? { go: { label: goWords(item)!, title: goTitle(item, project), run: () => onOpen(item, project?.id) } } : {})}
        {...mute(item)}
        {...(item.state !== 'working'
          ? { action: { label: `dismiss ${item.label}`, title: 'Dismiss — it returns only if it changes', run: () => dismiss([item], project?.id) } }
          : {})}
      >
        {item.question ? <Question question={item.question} onAnswer={(said) => answer(item, said, project?.id)} /> : null}
      </Row>
    )
  }

  const folded = (list: readonly InboxItem[], project?: { id: number; name: string }) =>
    fold(list, project?.id).flatMap((group) => {
      if (group.members.length === 1) return [row(group.head, project)]
      const open = unfolded.has(group.key)
      const out = [
        <Row
          key={group.key}
          rowKey={group.key}
          dot={<Dot state={group.head.state} />}
          by={group.head.by}
          state={stateSaid({ state: group.head.state })}
          label={group.head.label}
          place={placeSaid(group.head, project)}
          age={ageWords(now, group.head.entered)}
          urgent={group.members.some((one) => one.priority === 'urgent')}
          count={group.members.length}
          expanded={open}
          pressTitle={open ? 'Fold these' : `Show all ${group.members.length}`}
          onPress={() =>
            setUnfolded((was) => {
              const next = new Set(was)
              if (next.has(group.key)) next.delete(group.key)
              else next.add(group.key)
              return next
            })
          }
          {...mute(group.head)}
          {...(group.head.state !== 'working'
            ? { action: { label: `dismiss ${group.members.length} from ${group.head.by}`, title: 'Dismiss all of these', run: () => dismiss(group.members, project?.id) } }
            : {})}
        />,
      ]
      if (open) {
        out.push(
          <li key={`${group.key}:members`} className="border-border/60 ml-3 border-l">
            <ul>{group.members.map((member) => row(member, project, true))}</ul>
          </li>,
        )
      }
      return out
    })

  const nothing = isNothing(arranged)
  const muted = read.muted
  /* "Needs you only" is what emptied it: the same Inbox, shown whole, would have rows. */
  const hiddenByFilter = nothing && filter.show === 'needs' && !isNothing(arrange(read, { ...filter, show: 'all' }))
  const moreElsewhere = filter.where === 'here' && read.items.some((one) => !one.here && !one.project && (filter.show === 'all' || one.state === 'attention'))

  return (
    <>
      {nothing ? (
        <Empty data-empty="" className="py-6 md:p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle className="text-base">Nothing needs you</EmptyTitle>
            <EmptyDescription>{emptyWords({ filter, hiddenByFilter, moreElsewhere })}</EmptyDescription>
          </EmptyHeader>
          {hiddenByFilter || moreElsewhere ? (
            <EmptyContent className="flex-row justify-center">
              {hiddenByFilter ? (
                <Button size="sm" variant="outline" onClick={() => onFilter({ ...filter, show: 'all' })}>
                  Show everything
                </Button>
              ) : null}
              {moreElsewhere ? (
                <Button size="sm" variant="outline" onClick={() => onFilter({ ...filter, where: 'everywhere' })}>
                  Show everywhere
                </Button>
              ) : null}
            </EmptyContent>
          ) : null}
        </Empty>
      ) : null}

      {arranged.needs.length ? (
        <section aria-label="needs you" data-section="needs">
          <SectionHeading count={arranged.needs.length}>Needs you</SectionHeading>
          <ul>{folded(arranged.needs)}</ul>
        </section>
      ) : null}
      {arranged.working.length ? (
        <section aria-label="working" data-section="working">
          <SectionHeading count={arranged.working.length}>Working</SectionHeading>
          <ul>{folded(arranged.working)}</ul>
        </section>
      ) : null}
      {arranged.finished.length ? (
        <section aria-label="finished" data-section="finished">
          <SectionHeading
            count={arranged.finished.length}
            after={
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-[11px]"
                onClick={() => void after(api.act({ do: 'seen-all', scope: filter.where }), 'done')}
              >
                Mark finished as seen
              </button>
            }
          >
            Finished
          </SectionHeading>
          <ul>{folded(arranged.finished)}</ul>
        </section>
      ) : null}
      {arranged.project.length ? (
        <section aria-label="this project" data-section="project">
          <SectionHeading count={arranged.project.length}>{PROJECT_GROUP}</SectionHeading>
          <ul>{folded(arranged.project)}</ul>
        </section>
      ) : null}

      {arranged.elsewhere.map(({ project, items }) => (
        <section key={`project:${project.id}`} aria-label={`in ${project.name}`} data-section={`elsewhere-${project.id}`}>
          <SectionHeading count={items.length}>{`In ${project.name}`}</SectionHeading>
          <ul>{items.map((item) => row(item, project))}</ul>
        </section>
      ))}

      {filter.show === 'all' ? (
        <Earlier read={read} seen={arranged.seen} where={filter.where} api={api} now={now} after={after} setSaid={setSaid} onDismiss={(item) => dismiss([item])} />
      ) : null}

      {muted.length ? (
        <Collapsible open={mutedOpen} onOpenChange={setMutedOpen} asChild>
          <section aria-label="muted modules" data-muted={muted.length}>
            <h3 className="px-1 pt-2 pb-0.5">
              <CollapsibleTrigger className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-full items-center gap-1 rounded-sm px-0.5 text-[11px] outline-none focus-visible:ring-[3px]">
                {mutedOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                <BellOff className="size-3" aria-hidden />
                {mutedWords(muted.length)}
              </CollapsibleTrigger>
            </h3>
            <CollapsibleContent asChild>
              <ul>
                {muted.map((one) => (
                  <li key={one.id} data-muted-module={one.id} className="flex items-center gap-2 px-2 py-0.5 text-xs">
                    <span className="min-w-0 flex-1 truncate">{one.name}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-2"
                      aria-label={`show ${one.name} in the Inbox again`}
                      onClick={() => void after(api.use(one.id, true), 'done')}
                    >
                      Show again
                    </button>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </section>
        </Collapsible>
      ) : null}
    </>
  )
}

/** Earlier: collapsed; what finished and was seen, then the log of what closed, a page at a time. */
function Earlier({
  read,
  seen,
  where,
  api,
  now,
  after,
  setSaid,
  onDismiss,
}: {
  read: InboxReadResult
  seen: InboxItem[]
  where: Filter['where']
  api: InboxApi
  now: number
  after: After
  setSaid(said: string | null): void
  onDismiss(item: InboxItem): void
}) {
  const [open, setOpen] = useState(false)
  const [log, setLog] = useState<InboxLogResult | null>(null)
  const [more, setMore] = useState(false)

  /* The first page whenever it is opened, and again when the record or the kehikko shown changes. */
  useEffect(() => {
    if (!open) return
    let live = true
    api.log(where, 0, PAGE).then(
      (got) => {
        if (live) setLog(got)
      },
      (error: unknown) => {
        if (live) setSaid(sentence(error))
      },
    )
    return () => {
      live = false
    }
  }, [open, where, read.rev, api, setSaid])

  const loadMore = () => {
    if (!log || more) return
    setMore(true)
    api.log(where, log.rows.length, PAGE).then(
      (got) => {
        setMore(false)
        setLog((was) => (was ? { rows: [...was.rows, ...got.rows], more: got.more, total: got.total } : got))
      },
      (error: unknown) => {
        setMore(false)
        setSaid(sentence(error))
      },
    )
  }

  const total = (log?.total ?? read.earlier) + seen.length
  if (total === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section aria-label="earlier" data-section="earlier">
        <h3 className="px-1 pt-2 pb-0.5">
          <CollapsibleTrigger className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-full items-center gap-1 rounded-sm px-0.5 text-[11px] font-medium tracking-wide uppercase outline-none focus-visible:ring-[3px]">
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Earlier
            <span className="font-normal tabular-nums normal-case">{total}</span>
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent asChild>
          <div>
            <ul data-earlier="">
              {seen.map((item) => (
                <Row
                  key={`seen:${keyOf(item)}`}
                  rowKey={`seen:${keyOf(item)}`}
                  dot={<Ring label="finished, seen" />}
                  by={item.by}
                  state="finished, seen"
                  label={item.label}
                  place={item.where}
                  age={ageWords(now, item.entered)}
                  dim
                  action={{ label: `dismiss ${item.label}`, title: 'Dismiss — it returns only if it changes', run: () => onDismiss(item) }}
                />
              ))}
              {log === null ? (
                <li className="text-muted-foreground px-2 py-1 text-[11px]">Reading…</li>
              ) : log.rows.length === 0 && seen.length === 0 ? (
                <li className="text-muted-foreground px-2 py-1 text-[11px]">{where === 'here' ? 'Nothing earlier on this kehikko.' : 'Nothing earlier.'}</li>
              ) : (
                log.rows.map((one) => (
                  <Row
                    key={one.key}
                    rowKey={`log:${one.key}`}
                    dot={<Ring label={one.what} />}
                    by={one.by}
                    state={one.what}
                    label={one.label}
                    place={one.where}
                    age={ageWords(now, one.at)}
                    urgent={one.priority === 'urgent'}
                    dim
                    action={{
                      label: `forget ${one.label}`,
                      title: 'Forget — remove it from the log',
                      run: () => void after(api.act({ do: 'forget', keys: [{ module: one.module, id: one.id }], scope: where }), 'done'),
                    }}
                  />
                ))
              )}
              {log?.more ? (
                <li className="px-1.5 py-0.5">
                  <button type="button" className="text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-2" onClick={loadMore}>
                    {more ? 'Reading…' : `show ${Math.min(PAGE, log.total - log.rows.length)} more`}
                  </button>
                </li>
              ) : null}
            </ul>
            {log && log.total > 0 ? (
              <div className="px-2 py-1">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-[11px]"
                  title="Remove from the log what is shown here — what is open is not touched"
                  onClick={() => void after(api.act({ do: 'forget', scope: where }), 'done')}
                >
                  Forget what is shown
                </button>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

/** The page's own height, as the person resizes the container. Null until measured. */
function useHeight(element: React.RefObject<HTMLElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const at = element.current
    if (!at || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect || (rect.width === 0 && rect.height === 0)) return
      setHeight(Math.round(rect.height))
    })
    watch.observe(at)
    return () => watch.disconnect()
  }, [element])
  return height
}
