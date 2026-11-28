/**
 * Talks to the existing ExamsPrep FastAPI service.
 *
 * On an Android emulator, 10.0.2.2 is the computer running the API.
 * A phone on the same Wi-Fi needs the computer's LAN address instead.
 * Set EXPO_PUBLIC_API_URL in mobile/.env. Do not put a database password here.
 *
 * Routes another agent is still building (snap, tutor, speech, planner) are
 * called for real. A 404, 405, 501, or 503 is reported as unavailable. The
 * screens do not invent lessons, scores, or explanations.
 */

import { describeFailure } from '@/lib/policies'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://examsprep-api.onrender.com').replace(/\/$/, '')

export type ApiSuccess<T> = { ok: true; data: T; status: number }
export type ApiFailure = {
  ok: false
  message: string
  status: number | null
  unavailable: boolean
  offline: boolean
}
export type ApiResult<T> = ApiSuccess<T> | ApiFailure

export type ApiOptions = {
  idempotencyKey?: string
  /** Status codes that mean the feature is not deployed, rather than a missing row. */
  unavailableStatuses?: number[]
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
  options: ApiOptions = {},
): Promise<ApiResult<T>> {
  try {
    const headers = new Headers(init.headers)
    const formData = typeof FormData !== 'undefined' && init.body instanceof FormData
    if (init.body && !formData && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)
    const response = await fetch(`${API_URL}${path}`, { ...init, headers })
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; replayed?: boolean }
    if (!response.ok || body.ok === false) {
      const described = describeFailure(
        response.status,
        body.message || 'The request failed.',
        options.unavailableStatuses ?? [],
      )
      return { ok: false, status: response.status, ...described }
    }
    return { ok: true, data: body as T, status: response.status }
  } catch {
    const described = describeFailure(
      null,
      `Could not reach the ExamsPrep API at ${API_URL}. Check the connection, then set EXPO_PUBLIC_API_URL.`,
      [],
    )
    return { ok: false, status: null, ...described }
  }
}

export { API_URL }

/** Parallel AI routes. Missing routes stay unavailable; nothing is filled in locally. */
export const aiPaths = {
  snap: '/api/ai/snap',
  snapFollowUp: (id: string) => `/api/ai/snap/${encodeURIComponent(id)}/follow-up`,
  snapSave: (id: string) => `/api/ai/snap/${encodeURIComponent(id)}/save`,
  tutorTurn: '/api/ai/tutor/turns',
  lessonSpeech: (lessonId: string) => `/api/ai/lessons/${encodeURIComponent(lessonId)}/speech`,
  practice: '/api/ai/practice',
  planner: '/api/ai/planner',
} as const

export const AI_UNAVAILABLE = [404, 405, 501, 503]
