import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { readSession, writeSession } from '@/lib/storage'
import type { SessionUser } from '@/lib/types'

type SessionValue = {
  ready: boolean
  token: string | null
  user: SessionUser | null
  signIn: (token: string, user: SessionUser) => void
  signOut: () => void
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<SessionUser | null>(null)

  useEffect(() => {
    void readSession().then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as { token: string; user: SessionUser }
          setToken(saved.token)
          setUser(saved.user)
        } catch {
          void writeSession(null)
        }
      }
      setReady(true)
    })
  }, [])

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      token,
      user,
      signIn(nextToken, nextUser) {
        setToken(nextToken)
        setUser(nextUser)
        void writeSession(JSON.stringify({ token: nextToken, user: nextUser }))
      },
      signOut() {
        setToken(null)
        setUser(null)
        void writeSession(null)
      },
    }),
    [ready, token, user],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider')
  }
  return value
}
