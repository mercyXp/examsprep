import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createIdempotencyKey,
  describeFailure,
  lessonPlainText,
  nextOutboxStatus,
  planReminders,
  prettyLatex,
  videoTarget,
} from './policies.ts'

test('a missing AI route is unavailable and not treated as offline', () => {
  const failure = describeFailure(404, 'Not Found', [404, 405, 501, 503])
  assert.equal(failure.unavailable, true)
  assert.equal(failure.offline, false)
  assert.match(failure.message, /not on the server yet/)
})

test('a network failure stays retryable', () => {
  const failure = describeFailure(null, 'Could not reach the ExamsPrep API.', [])
  assert.equal(failure.offline, true)
  assert.equal(nextOutboxStatus({ ok: false, offline: true, status: null, message: failure.message }), 'pending')
})

test('a successful replay closes the outbox row', () => {
  assert.equal(nextOutboxStatus({ ok: true, offline: false, status: 200, message: '' }), 'done')
})

test('a validation error is a conflict, a retryable 409 stays pending', () => {
  assert.equal(
    nextOutboxStatus({
      ok: false,
      offline: false,
      status: 422,
      message: 'Check the details you entered and try again.',
    }),
    'conflict',
  )
  assert.equal(
    nextOutboxStatus({ ok: false, offline: false, status: 409, message: 'That sync is already being saved. Retry.' }),
    'pending',
  )
})

test('idempotency keys stay within the API alphabet', () => {
  const key = createIdempotencyKey('progress', () => 'abc-1234-zzzz')
  assert.match(key, /^[A-Za-z0-9_-]{8,80}$/)
})

test('reminders honour the toggles and skip past exams', () => {
  const plans = planReminders({
    dailyStudy: true,
    streakWarning: false,
    examReminder: true,
    dailyHour: 18,
    dailyMinute: 30,
    examDates: ['2020-01-01', '2026-12-01'],
    now: new Date('2026-11-28T12:00:00'),
  })
  assert.equal(plans.filter((item) => item.channel === 'daily').length, 1)
  assert.equal(plans.filter((item) => item.channel === 'streak').length, 0)
  assert.ok(plans.some((item) => item.channel === 'exam' && item.title === 'Exam today'))
  assert.equal(
    plans.some((item) => item.body.includes('2020-01-01')),
    false,
  )
})

test('math text and youtube links stay readable without a webview', () => {
  assert.equal(prettyLatex('\\frac{1}{2} \\pi'), '1/2 π')
  assert.equal(videoTarget('https://youtu.be/abcdefghijk')?.kind, 'youtube')
  assert.equal(videoTarget('https://cdn.example.com/lesson.mp4')?.kind, 'file')
  assert.equal(
    lessonPlainText([{ title: 'Sets', blocks: [{ text: 'A set is a collection.' }] }]).includes('Sets'),
    true,
  )
})
