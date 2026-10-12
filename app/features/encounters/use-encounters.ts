import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEncounters } from '@/lib/api'
import { useSession } from '@/features/session/session-provider'
import { viewOf, type EncounterView } from './encounter-view'

export function useEncounters() {
  const { session } = useSession()
  const identity = session?.identity ?? null
  const query = useQuery({
    queryKey: ['encounters', identity],
    enabled: !!identity,
    queryFn: () => fetchEncounters(identity as string),
    refetchInterval: 30_000,
  })
  const views = useMemo<EncounterView[]>(() => {
    if (!identity || !query.data) return []
    return query.data.encounters
      .map((r) => viewOf(r, identity))
      .filter((v): v is EncounterView => v !== null)
      .sort((a, b) => b.record.firstSeen - a.record.firstSeen)
  }, [identity, query.data])
  return { query, views, profile: query.data?.profile ?? null }
}
