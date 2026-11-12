import { BellOff, ChevronDown, ChevronRight, X } from 'lucide-react'
import { useState } from 'react'

import { LIMITS, type InboxItem } from 'kehikot-module-protocol'
import { Badge, Button, Textarea, cn } from 'kehikot-module-protocol/client/ui'

import { STATE_WORDS } from '../inbox.ts'

/**
 * The pieces of the Inbox's list. Every string here is the host's or a module's TEXT: drawn as
 * text, never as markup or a link, and no URL in one is ever opened. Never colour alone: every dot
 * stands beside its state in words.
 */

/** The attention colour, the same the host bar's count uses, so the bar and the module read as one thing. */
export const ATTENTION = 'text-amber-600 dark:text-amber-400'

const LOOK: Record<InboxItem['state'], string> = {
  attention: 'bg-amber-500 dark:bg-amber-400',
  done: 'bg-emerald-500 dark:bg-emerald-400',
  working:
    'bg-neutral-500 dark:bg-neutral-400 motion-safe:animate-pulse motion-reduce:bg-transparent motion-reduce:ring-[1.5px] motion-reduce:ring-inset motion-reduce:ring-neutral-500',
}

export function Dot({ state }: { state: InboxItem['state'] }) {
  return <span role="img" aria-label={STATE_WORDS[state]} data-dot={state} className={cn('inline-block size-1.5 shrink-0 rounded-full', LOOK[state])} />
}

/** A closed thing's mark: a hollow ring, with what became of it as its name. */
export function Ring({ label }: { label: string }) {
  return <span role="img" aria-label={label} className="ring-muted-foreground/60 inline-block size-1.5 shrink-0 rounded-full ring-1 ring-inset" />
}

export function Urgent() {
  return (
    <Badge variant="outline" className={cn('h-4 border-amber-500/60 px-1 text-[10px] tracking-wide uppercase', ATTENTION)}>
      urgent
    </Badge>
  )
}

export function SectionHeading({ children, count, after }: { children: string; count: number; after?: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground flex items-baseline gap-1.5 px-1.5 pt-2 pb-0.5 text-[11px] font-medium tracking-wide uppercase">
      {children}
      <span className="font-normal tabular-nums normal-case">{count}</span>
      {after ? <span className="ml-auto font-normal normal-case">{after}</span> : null}
    </h3>
  )
}

export interface RowProps {
  /** `data-key`: the item's identity on the page, for the highlight and the scroll. */
  rowKey: string
  dot: React.ReactNode
  by: string
  state: string
  label: string
  detail?: string
  place: string
  age: string
  urgent?: boolean
  /** A folded row's member count; pressing it opens and closes the members. */
  count?: number
  expanded?: boolean
  highlighted?: boolean
  dim?: boolean
  onPress?: () => void
  pressTitle?: string
  action?: { label: string; title: string; run(): void }
  mute?: { label: string; title: string; run(): void }
  /** An item whose primary action is to go to its place (an agent's offer): a primary button beside dismiss. */
  go?: { label: string; title: string; run(): void }
  children?: React.ReactNode
}

/** One row: WHO says it before what, the label, the place and the age; pressing it goes there. */
export function Row({ rowKey, dot, by, state, label, detail, place, age, urgent, count, expanded, highlighted, dim, onPress, pressTitle, action, mute, go, children }: RowProps) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
        <span className="flex shrink-0">{dot}</span>
        <span className="text-muted-foreground min-w-0 truncate" data-byline="">
          <span className="text-foreground/80">{by}</span>
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          {state}
        </span>
        {urgent ? <Urgent /> : null}
        <span className="text-muted-foreground/80 ml-auto shrink-0 whitespace-nowrap tabular-nums">{age}</span>
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1 pl-3 text-xs">
        <span className="min-w-0 truncate" data-label="">
          {label}
        </span>
        {count && count > 1 ? (
          <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[10px] tabular-nums">
            {expanded ? <ChevronDown className="size-2.5" /> : <ChevronRight className="size-2.5" />}
            {count}
          </span>
        ) : null}
      </span>
      {place ? <span className="text-muted-foreground/80 mt-px truncate pl-3 text-[11px]">{place}</span> : null}
    </>
  )
  return (
    <li
      data-key={rowKey}
      data-highlighted={highlighted ? '' : undefined}
      className={cn(
        'group/row hover:bg-accent/60 flex flex-wrap items-start gap-1 rounded-sm px-1.5 py-1',
        dim && 'opacity-80',
        highlighted && 'bg-amber-500/10 ring-1 ring-amber-500/50',
      )}
    >
      {onPress ? (
        <button
          type="button"
          onClick={onPress}
          title={pressTitle ?? detail}
          aria-expanded={count && count > 1 ? expanded : undefined}
          className="focus-visible:ring-ring/50 flex min-w-0 flex-1 cursor-pointer flex-col items-stretch rounded-sm text-left outline-none focus-visible:ring-[3px]"
        >
          {body}
        </button>
      ) : (
        <div title={detail} className="flex min-w-0 flex-1 flex-col items-stretch">
          {body}
        </div>
      )}
      {mute ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={mute.run}
          aria-label={mute.label}
          title={mute.title}
          data-mute=""
          className="text-muted-foreground mt-0.5 size-5 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        >
          <BellOff className="size-3" />
        </Button>
      ) : null}
      {go ? (
        <Button
          type="button"
          size="sm"
          onClick={go.run}
          title={go.title}
          data-go=""
          className="mt-0.5 h-6 max-w-40 shrink-0 truncate px-2 text-[11px]"
        >
          {go.label}
        </Button>
      ) : null}
      {action ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={action.run}
          aria-label={action.label}
          title={action.title}
          className="text-muted-foreground mt-0.5 size-5 opacity-60 group-hover/row:opacity-100 focus-visible:opacity-100"
        >
          <X className="size-3" />
        </Button>
      ) : null}
      {children}
    </li>
  )
}

export type Said = { choice: string } | { answer: string }
/** What an answer came to: sent, or not and why. */
export type Answered = { ok: true } | { ok: false; why: string }

/**
 * The question an item asks, drawn whole under its row: the text, its choices as buttons and a
 * reply field; once answered, "Answered: …" and no controls. `onAnswer` is called straight from the
 * press, which is what a host holds an answer to.
 */
export function Question({ question, onAnswer }: { question: NonNullable<InboxItem['question']>; onAnswer(said: Said): Promise<Answered> }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [why, setWhy] = useState<string | null>(null)

  const send = (said: Said) => {
    if (sending) return
    setSending(true)
    setWhy(null)
    void onAnswer(said).then((got) => {
      setSending(false)
      if (got.ok) setText('')
      else setWhy(got.why)
    })
  }
  const submit = () => {
    const said = text.trim()
    if (said) send({ answer: said })
  }

  return (
    <div data-question="" className="flex min-w-0 basis-full flex-col gap-1 pl-4">
      <p data-question-text="" className="max-h-48 overflow-y-auto text-xs leading-snug break-words whitespace-pre-wrap">
        {question.text}
      </p>
      {question.answered !== null ? (
        <p data-answered="" className="text-muted-foreground text-xs break-words whitespace-pre-wrap">
          Answered: {question.answered}
        </p>
      ) : (
        <>
          {question.choices.length ? (
            <span role="group" aria-label="choices" className="flex max-w-full min-w-0 flex-wrap gap-1">
              {question.choices.map((choice, at) => (
                <Button
                  key={`${at}:${choice}`}
                  type="button"
                  size="sm"
                  variant="outline"
                  title={choice}
                  data-choice=""
                  disabled={sending}
                  className="block h-6 max-w-full min-w-0 shrink truncate px-2 text-left text-[11px]"
                  onClick={() => send({ choice })}
                >
                  {choice}
                </Button>
              ))}
            </span>
          ) : null}
          <form
            className="flex min-w-0 items-end gap-1"
            data-reply=""
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <Textarea
              rows={1}
              value={text}
              maxLength={LIMITS.MESSAGE_BODY}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
              placeholder="Reply…"
              aria-label="Your answer"
              className="min-h-6 flex-1 resize-none rounded-sm px-1.5 py-0.5 text-xs md:text-xs"
            />
            <Button type="submit" size="sm" className="h-6 shrink-0 px-2 text-[11px]" disabled={sending || !text.trim()}>
              Send
            </Button>
          </form>
          {why !== null ? (
            <p role="alert" data-answer-why="" className="text-xs break-words">
              Not sent: {why}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
