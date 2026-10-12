import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, createSession, describeApiError, type Tier } from '@/lib/api'
import { describeError } from '@/lib/errors'
import { clearSession, loadSession, saveSession, type StoredSession } from '@/lib/session-store'
import { extractSignature, signatureToBase58, signInMessage, verifyWalletSignature } from '@/lib/sign-in'

export type SessionStatus = 'loading' | 'signed-out' | 'connecting' | 'signing' | 'verifying' | 'signed-in'

type SessionContextValue = {
  status: SessionStatus
  session: StoredSession | null
  tier: Tier | null
  error: string | null
  /** Connects the wallet if needed, signs the sign-in message once and trades it for a session. */
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  /** Called when the server answers 401: the stored session is dead. */
  expire: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

export function SessionProvider({ children }: PropsWithChildren) {
  const { account, connect, disconnect, signMessages } = useMobileWallet()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [session, setSession] = useState<StoredSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    let live = true
    loadSession(Math.floor(Date.now() / 1000)).then((s) => {
      if (!live) return
      setSession(s)
      setStatus(s ? 'signed-in' : 'signed-out')
    })
    return () => {
      live = false
    }
  }, [])

  const signIn = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setError(null)
    try {
      setStatus('connecting')
      const wallet = account ?? (await connect())
      setStatus('signing')
      const message = signInMessage(wallet.address, Math.floor(Date.now() / 1000))
      const messageBytes = new TextEncoder().encode(message)
      const signature = extractSignature(await signMessages(messageBytes), messageBytes)
      if (!verifyWalletSignature(wallet.address, messageBytes, signature)) {
        throw new Error('Your wallet returned a signature that does not verify.')
      }
      setStatus('verifying')
      const res = await createSession(wallet.address, message, signatureToBase58(signature))
      const stored: StoredSession = {
        sessionToken: res.sessionToken,
        identity: res.identity,
        wallet: wallet.address,
        tier: res.tier,
        issuedAt: Math.floor(Date.now() / 1000),
      }
      await saveSession(stored)
      setSession(stored)
      setStatus('signed-in')
    } catch (e) {
      if (e instanceof ApiError) setError(describeApiError(e))
      else {
        const { message, cancelled } = describeError(e)
        setError(cancelled ? null : message)
      }
      setStatus('signed-out')
    } finally {
      busy.current = false
    }
  }, [account, connect, signMessages])

  const expire = useCallback(async () => {
    await clearSession()
    queryClient.clear()
    setSession(null)
    setError('Your session ended. Sign in again to keep the radar running.')
    setStatus('signed-out')
  }, [queryClient])

  const signOut = useCallback(async () => {
    await clearSession()
    queryClient.clear()
    setSession(null)
    setError(null)
    setStatus('signed-out')
    await disconnect()
  }, [disconnect, queryClient])

  const value = useMemo<SessionContextValue>(
    () => ({ status, session, tier: session?.tier ?? null, error, signIn, signOut, expire }),
    [status, session, error, signIn, signOut, expire],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
