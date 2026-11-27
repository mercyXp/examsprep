import { createMMKV } from 'react-native-mmkv'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type SessionUser = {
  id: string
  name: string
  email: string
  roles: string[]
}

type SessionValue = {
  ready: boolean
  token: string | null
  user: SessionUser | null
  signIn: (token: string, user: SessionUser) => void
  signOut: () => void
}

const storage = createMMKV({ id: 'examsprep-session' })
const TOKEN_KEY = 'token'
const USER_KEY = 'user'

const SessionContext = createContext<SessionValue | null>(null)

function readUser(): SessionUser | null {
  const raw = storage.getString(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(storage.getString(TOKEN_KEY) ?? null)
  const [user, setUser] = useState<SessionUser | null>(readUser())

  const value = useMemo<SessionValue>(
    () => ({
      ready: true,
      token,
      user,
      signIn: (nextToken, nextUser) => {
        storage.set(TOKEN_KEY, nextToken)
        storage.set(USER_KEY, JSON.stringify(nextUser))
        setToken(nextToken)
        setUser(nextUser)
      },
      signOut: () => {
        storage.remove(TOKEN_KEY)
        storage.remove(USER_KEY)
        setToken(null)
        setUser(null)
      },
    }),
    [token, user],
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
