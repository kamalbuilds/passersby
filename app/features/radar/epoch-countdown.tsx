import { useEffect, useState } from 'react'
import { T } from '@/components/ui/text'
import { countdown } from '@/lib/format'

export function EpochCountdown({ endsAt }: { endsAt: number | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!endsAt) return null
  return (
    <T v="mono" c="inkDim" tabular>
      new code in {countdown(endsAt - now)}
    </T>
  )
}
