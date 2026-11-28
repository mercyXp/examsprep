const KEY = 'examsprint.session'

export async function readSession(): Promise<string | null> {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export async function writeSession(value: string | null): Promise<void> {
  try {
    if (value == null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, value)
  } catch {
    // Private mode can block storage. The session still lives in memory.
  }
}
