/**
 * Pure rules for the phone: API failures, the offline outbox, reminder times,
 * and lesson text. No React Native imports, so they can run in Node tests.
 */

export type FailureKind = { unavailable: boolean; offline: boolean; message: string }

const UNAVAILABLE_YET = 'This part of ExamsPrep is not on the server yet.'
const UNAVAILABLE_NOW = 'This part of ExamsPrep is unavailable right now.'

export function describeFailure(
  status: number | null,
  serverMessage: string,
  unavailableStatuses: number[],
): FailureKind {
  if (status === null) {
    return {
      unavailable: false,
      offline: true,
      message: serverMessage || 'Could not reach the ExamsPrep API.',
    }
  }
  const unavailable = unavailableStatuses.includes(status)
  if (!unavailable) {
    return { unavailable: false, offline: false, message: serverMessage || 'The request failed.' }
  }
  if (status === 503) {
    return { unavailable: true, offline: false, message: serverMessage || UNAVAILABLE_NOW }
  }
  return { unavailable: true, offline: false, message: UNAVAILABLE_YET }
}

export type OutboxDecision = 'done' | 'pending' | 'conflict'

export function nextOutboxStatus(input: {
  ok: boolean
  offline: boolean
  status: number | null
  message: string
}): OutboxDecision {
  if (input.ok) return 'done'
  if (input.offline || input.status === null) return 'pending'
  if (input.status === 401 || input.status === 408 || input.status === 429 || input.status >= 500) return 'pending'
  if (input.status === 409 && /retry/i.test(input.message)) return 'pending'
  return 'conflict'
}

export function createIdempotencyKey(prefix: string, random: () => string): string {
  const raw = `${prefix}-${random()}`.replace(/[^A-Za-z0-9_-]/g, '')
  if (raw.length < 8) {
    throw new Error('Idempotency key is too short.')
  }
  return raw.slice(0, 80)
}

export type ReminderPlan = {
  channel: 'daily' | 'streak' | 'exam'
  title: string
  body: string
  when: { kind: 'daily'; hour: number; minute: number } | { kind: 'date'; iso: string }
}

export function planReminders(input: {
  dailyStudy: boolean
  streakWarning: boolean
  examReminder: boolean
  dailyHour: number
  dailyMinute: number
  examDates: string[]
  now: Date
}): ReminderPlan[] {
  const plans: ReminderPlan[] = []
  const hour = clamp(input.dailyHour, 0, 23)
  const minute = clamp(input.dailyMinute, 0, 59)
  if (input.dailyStudy) {
    plans.push({
      channel: 'daily',
      title: 'Time to study',
      body: 'Open ExamsPrep and keep today’s lesson moving.',
      when: { kind: 'daily', hour, minute },
    })
  }
  if (input.streakWarning) {
    plans.push({
      channel: 'streak',
      title: 'Streak check',
      body: 'A short session today keeps your study streak. Badges need three days in a row.',
      when: { kind: 'daily', hour: 20, minute: 0 },
    })
  }
  if (input.examReminder) {
    const seen = new Set<string>()
    for (const value of input.examDates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || seen.has(value)) continue
      seen.add(value)
      const morning = new Date(`${value}T08:00:00`)
      const eveningBefore = new Date(morning.getTime() - 14 * 60 * 60 * 1000)
      if (eveningBefore.getTime() > input.now.getTime()) {
        plans.push({
          channel: 'exam',
          title: 'Exam tomorrow',
          body: `You have an exam on ${value}. Review the module notes tonight.`,
          when: { kind: 'date', iso: eveningBefore.toISOString() },
        })
      }
      if (morning.getTime() > input.now.getTime()) {
        plans.push({
          channel: 'exam',
          title: 'Exam today',
          body: `Exam day ${value}. Open your saved notes if you are offline.`,
          when: { kind: 'date', iso: morning.toISOString() },
        })
      }
      if (plans.filter((item) => item.channel === 'exam').length >= 24) break
    }
  }
  return plans
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

const GREEK: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  sigma: 'σ',
  omega: 'ω',
}

export function prettyLatex(value: string): string {
  let text = value.trim()
  if (!text) return ''
  text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2')
  text = text.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
  text = text.replace(/\\(left|right)\b/g, '')
  text = text.replace(/\\([a-zA-Z]+)/g, (_match, name: string) => GREEK[name] ?? name)
  text = text.replace(/[{}]/g, '')
  return text
}

export type PlainBlock = {
  type?: string
  text?: string
  items?: string[]
  prompt?: string
  latex?: string
  caption?: string
  code?: string
  title?: string
  transcript?: string
  front?: string
  back?: string
  notesOnly?: boolean
}

export function lessonPlainText(slides: { title?: string; blocks?: PlainBlock[] }[]): string {
  const parts: string[] = []
  for (const slide of slides) {
    if (slide.title) parts.push(slide.title)
    for (const block of slide.blocks ?? []) {
      if (block.notesOnly) continue
      if (block.text) parts.push(block.text)
      if (block.items?.length) parts.push(block.items.join('. '))
      if (block.prompt) parts.push(block.prompt)
      if (block.latex) parts.push(prettyLatex(block.latex))
      if (block.caption) parts.push(block.caption)
      if (block.transcript) parts.push(block.transcript)
      if (block.front) parts.push(block.front)
      if (block.back) parts.push(block.back)
    }
  }
  return parts.join('\n\n').slice(0, 4000)
}

export function videoTarget(url: string): { kind: 'youtube'; href: string } | { kind: 'file'; href: string } | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  const youtube = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/)
  if (youtube?.[1]) return { kind: 'youtube', href: `https://www.youtube.com/watch?v=${youtube[1]}` }
  if (/^https?:\/\//i.test(trimmed)) return { kind: 'file', href: trimmed }
  return null
}
