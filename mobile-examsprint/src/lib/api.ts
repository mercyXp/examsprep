import { Platform } from 'react-native'

/**
 * Same FastAPI service as the website and the main ExamsPrep app.
 * An Android emulator reaches the computer at 10.0.2.2. Web preview uses localhost.
 */
const fallback = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000'
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? fallback).replace(/\/$/, '')

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string }

export async function api<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<ApiResult<T>> {
  try {
    const headers = new Headers(init.headers)
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    const response = await fetch(`${API_URL}${path}`, { ...init, headers })
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string }
    if (!response.ok || body.ok === false) {
      return { ok: false, message: body.message || 'The request failed.' }
    }
    return { ok: true, data: body as T }
  } catch {
    return {
      ok: false,
      message: `Could not reach the ExamsPrep API at ${API_URL}. Start FastAPI, then set EXPO_PUBLIC_API_URL.`,
    }
  }
}
