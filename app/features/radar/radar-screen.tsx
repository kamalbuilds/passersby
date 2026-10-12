import { useSession } from '@/features/session/session-provider'
import { useRadar } from './radar-provider'
import { RadarView } from './radar-view'

export function RadarScreen() {
  const { status, session } = useSession()
  const radar = useRadar()
  return (
    <RadarView
      loading={status === 'loading'}
      signedIn={status === 'signed-in' && !!session}
      phase={radar.phase}
      problem={radar.problem}
      syncError={radar.syncError}
      nearby={radar.nearby}
      epochEndsAt={radar.epochEndsAt}
      onFix={radar.openFix}
    />
  )
}
