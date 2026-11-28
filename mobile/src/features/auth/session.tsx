import * as SecureStore from 'expo-secure-store'
import { createMMKV } from 'react-native-mmkv'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

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
  signIn: (token: string, user: SessionUser) => Promise<void>
  signOut: () => Promise<void>
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

async function readToken(): Promise<string | null> {
  try {
    const secure = await SecureStore.getItemAsync(TOKEN_KEY)
    if (secure) {
      storage.remove(TOKEN_KEY)
      return secure
    }
  } catch {
    // Secure storage is unavailable (for example Expo web). The MMKV copy is the fallback.
  }
  return storage.getString(TOKEN_KEY) ?? null
}

async function writeToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token)
    storage.remove(TOKEN_KEY)
  } catch {
    storage.set(TOKEN_KEY, token)
  }
}

async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
  } catch {
    // Already gone, or secure storage is unavailable.
  }
  storage.remove(TOKEN_KEY)
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<SessionUser | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const nextToken = await readToken()
      if (!active) return
      setToken(nextToken)
      setUser(readUser())
      setReady(true)
    })()
    return () => {
      active = false
    }
  }, [])

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      token,
      user,
      signIn: async (nextToken, nextUser) => {
        await writeToken(nextToken)
        storage.set(USER_KEY, JSON.stringify(nextUser))
        setToken(nextToken)
        setUser(nextUser)
      },
      signOut: async () => {
        await clearToken()
        storage.remove(USER_KEY)
        setToken(null)
        setUser(null)
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
