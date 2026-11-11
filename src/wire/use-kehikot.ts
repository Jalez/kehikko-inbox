import { useHost, type Host as ProtocolHost } from 'kehikot-module-protocol/client/react'
import type { HostEvents } from 'kehikot-module-protocol/client'

import { ID } from '../../manifest.ts'

/**
 * What the screen needs from the host: the protocol's `useHost`, which has already put the theme on
 * <html>, keeps the view (the header's two switches and the scroll, `keepView`, protocol 2.70.0)
 * and holds the host's cover until `ready()`. A plain object, so a screen renders in a test
 * without a host.
 */
export type Host = Pick<ProtocolHost, 'where' | 'projectPath' | 'request' | 'header'> &
  Partial<Pick<ProtocolHost, 'answers' | 'footer' | 'drawsFooter' | 'ready' | 'visible'>>

export function useKehikot(events: HostEvents = {}): ProtocolHost {
  return useHost(ID, events)
}
