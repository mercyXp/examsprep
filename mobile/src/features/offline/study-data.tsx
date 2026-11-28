import NetInfo from '@react-native-community/netinfo'
import * as Crypto from 'expo-crypto'
import * as SQLite from 'expo-sqlite'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useSession } from '@/features/auth/session'
import { api, type ApiResult } from '@/lib/api'
import { createIdempotencyKey, nextOutboxStatus } from '@/lib/policies'

export type DownloadKind = 'lesson' | 'quiz' | 'notes' | 'practice'

export type DownloadRow = {
  kind: DownloadKind
  remoteId: string
  title: string
  payload: string
  savedAt: string
}

export type OutboxRow = {
  id: string
  kind: string
  path: string
  method: string
  body: string
  status: string
  attempts: number
  lastError: string | null
}

type StudyValue = {
  ready: boolean
  online: boolean
  pending: number
  conflicts: OutboxRow[]
  saveDownload: (row: Omit<DownloadRow, 'savedAt'>) => Promise<void>
  readDownload: (kind: DownloadKind, remoteId: string) => Promise<DownloadRow | null>
  listDownloads: (kind?: DownloadKind) => Promise<DownloadRow[]>
  enqueue: (input: { kind: string; path: string; method: string; body: unknown }) => Promise<string>
  flush: () => Promise<void>
}

const StudyContext = createContext<StudyValue | null>(null)

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null

function database(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync('examsprep-study.db')
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS downloads (
          kind TEXT NOT NULL,
          remote_id TEXT NOT NULL,
          title TEXT NOT NULL,
          payload TEXT NOT NULL,
          saved_at TEXT NOT NULL,
          PRIMARY KEY (kind, remote_id)
        );
        CREATE TABLE IF NOT EXISTS outbox (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          path TEXT NOT NULL,
          method TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );
      `)
      await db.runAsync(`UPDATE outbox SET status = 'pending' WHERE status = 'syncing'`)
      return db
    })()
  }
  return databasePromise
}

function newKey(kind: string): string {
  return createIdempotencyKey(kind, () => Crypto.randomUUID())
}

export function StudyDataProvider({ children }: { children: ReactNode }) {
  const { token } = useSession()
  const [ready, setReady] = useState(false)
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [conflicts, setConflicts] = useState<OutboxRow[]>([])

  const refreshCounts = useCallback(async () => {
    const db = await database()
    const pendingRow = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM outbox WHERE status = ?',
      'pending',
    )
    const conflictRows = await db.getAllAsync<OutboxRow>(
      'SELECT id, kind, path, method, body, status, attempts, last_error AS lastError FROM outbox WHERE status = ? ORDER BY created_at',
      'conflict',
    )
    setPending(pendingRow?.count ?? 0)
    setConflicts(conflictRows)
  }, [])

  const tokenRef = useRef(token)
  useEffect(() => {
    tokenRef.current = token
  }, [token])

  const flush = useCallback(async () => {
    const activeToken = tokenRef.current
    if (!activeToken) return
    const db = await database()
    const rows = await db.getAllAsync<{
      id: string
      path: string
      method: string
      body: string
      attempts: number
    }>('SELECT id, path, method, body, attempts FROM outbox WHERE status = ? ORDER BY created_at', 'pending')
    for (const row of rows) {
      await db.runAsync('UPDATE outbox SET status = ?, attempts = ? WHERE id = ?', 'syncing', row.attempts + 1, row.id)
      const result: ApiResult<unknown> = await api(row.path, { method: row.method, body: row.body }, activeToken, {
        idempotencyKey: row.id,
      })
      const decision = nextOutboxStatus({
        ok: result.ok,
        offline: result.ok ? false : result.offline,
        status: result.ok ? result.status : result.status,
        message: result.ok ? '' : result.message,
      })
      if (decision === 'done') {
        await db.runAsync('UPDATE outbox SET status = ?, last_error = NULL WHERE id = ?', 'done', row.id)
      } else if (decision === 'pending') {
        const message = result.ok ? '' : result.message
        await db.runAsync('UPDATE outbox SET status = ?, last_error = ? WHERE id = ?', 'pending', message, row.id)
        if (!result.ok && result.offline) break
      } else {
        const message = result.ok ? '' : result.message
        await db.runAsync('UPDATE outbox SET status = ?, last_error = ? WHERE id = ?', 'conflict', message, row.id)
      }
    }
    await refreshCounts()
  }, [refreshCounts])

  useEffect(() => {
    let active = true
    void database().then(() => {
      if (active) setReady(true)
      void refreshCounts()
    })
    const subscription = NetInfo.addEventListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false)
      setOnline(connected)
      if (connected) void flush()
    })
    return () => {
      active = false
      subscription()
    }
  }, [flush, refreshCounts])

  const saveDownload = useCallback(async (row: Omit<DownloadRow, 'savedAt'>) => {
    const db = await database()
    await db.runAsync(
      `INSERT INTO downloads (kind, remote_id, title, payload, saved_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(kind, remote_id) DO UPDATE SET title = excluded.title, payload = excluded.payload, saved_at = excluded.saved_at`,
      row.kind,
      row.remoteId,
      row.title,
      row.payload,
      new Date().toISOString(),
    )
  }, [])

  const readDownload = useCallback(async (kind: DownloadKind, remoteId: string) => {
    const db = await database()
    const row = await db.getFirstAsync<{
      kind: DownloadKind
      remote_id: string
      title: string
      payload: string
      saved_at: string
    }>(
      'SELECT kind, remote_id, title, payload, saved_at FROM downloads WHERE kind = ? AND remote_id = ?',
      kind,
      remoteId,
    )
    if (!row) return null
    return { kind: row.kind, remoteId: row.remote_id, title: row.title, payload: row.payload, savedAt: row.saved_at }
  }, [])

  const listDownloads = useCallback(async (kind?: DownloadKind) => {
    const db = await database()
    const rows = kind
      ? await db.getAllAsync<{
          kind: DownloadKind
          remote_id: string
          title: string
          payload: string
          saved_at: string
        }>(
          'SELECT kind, remote_id, title, payload, saved_at FROM downloads WHERE kind = ? ORDER BY saved_at DESC',
          kind,
        )
      : await db.getAllAsync<{
          kind: DownloadKind
          remote_id: string
          title: string
          payload: string
          saved_at: string
        }>('SELECT kind, remote_id, title, payload, saved_at FROM downloads ORDER BY saved_at DESC')
    return rows.map((row) => ({
      kind: row.kind,
      remoteId: row.remote_id,
      title: row.title,
      payload: row.payload,
      savedAt: row.saved_at,
    }))
  }, [])

  const enqueue = useCallback(
    async (input: { kind: string; path: string; method: string; body: unknown }) => {
      const db = await database()
      const id = newKey(input.kind)
      await db.runAsync(
        'INSERT INTO outbox (id, kind, path, method, body, created_at, status, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
        id,
        input.kind,
        input.path,
        input.method,
        JSON.stringify(input.body),
        new Date().toISOString(),
        'pending',
      )
      await refreshCounts()
      return id
    },
    [refreshCounts],
  )

  const value = useMemo<StudyValue>(
    () => ({
      ready,
      online,
      pending,
      conflicts,
      saveDownload,
      readDownload,
      listDownloads,
      enqueue,
      flush,
    }),
    [conflicts, enqueue, flush, listDownloads, online, pending, readDownload, ready, saveDownload],
  )

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>
}

export function useStudyData(): StudyValue {
  const value = useContext(StudyContext)
  if (!value) throw new Error('useStudyData must be used inside StudyDataProvider')
  return value
}
