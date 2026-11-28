import { useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useLocalSearchParams } from 'expo-router'

import { useSession } from '@/features/auth/session'
import { useStudyData } from '@/features/offline/study-data'
import { api } from '@/lib/api'
import { Button, Card, ErrorText, Note, Screen, Title } from '@/ui/screen'
import { LessonBlockView, type LessonBlock } from '@/ui/lesson-blocks'

type Slide = { id?: string; title: string; blocks?: LessonBlock[] }
type Lesson = {
  id?: string
  title: string
  description: string
  slides: Slide[]
  progress: { currentSlideIndex: number; checkResults: Record<string, { correct?: boolean }>; completed: boolean }
}

export default function LessonScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>()
  const { token } = useSession()
  const study = useStudyData()
  const online = study.online
  const readDownload = study.readDownload
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [revealed, setRevealed] = useState(1)
  const [checks, setChecks] = useState<Record<string, { correct?: boolean }>>({})
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [offlineCopy, setOfflineCopy] = useState(false)

  useEffect(() => {
    if (!lessonId) return
    let cancelled = false
    void (async () => {
      const show = (item: Lesson) => {
        if (cancelled) return
        setLesson(item)
        setSlideIndex(item.progress?.currentSlideIndex ?? 0)
        setChecks(item.progress?.checkResults ?? {})
        setError('')
      }
      if (token && online) {
        const result = await api<{ item: Lesson }>(`/api/learn/lessons/${lessonId}`, {}, token)
        if (cancelled) return
        if (result.ok) {
          show(result.data.item)
          return
        }
        if (!result.offline) {
          setError(result.message)
          return
        }
      }
      const stored = await readDownload('lesson', lessonId)
      if (cancelled) return
      if (!stored) {
        setError('This lesson is not on the phone, and the API could not be reached.')
        return
      }
      show(JSON.parse(stored.payload) as Lesson)
      setOfflineCopy(true)
    })()
    return () => {
      cancelled = true
    }
  }, [lessonId, online, readDownload, token])

  const slide = lesson?.slides[slideIndex]
  const blocks = (slide?.blocks ?? []).filter((block) => !block.notesOnly)
  const visible = blocks.slice(0, revealed)
  const atEndOfSlide = revealed >= blocks.length
  const lastSlide = lesson ? slideIndex >= lesson.slides.length - 1 : false

  async function persist(nextIndex: number, nextRevealed: number, nextChecks: typeof checks, completed: boolean) {
    if (!token || !lessonId) return
    const body = {
      current_slide_index: nextIndex,
      revealed_units: nextRevealed,
      check_results: nextChecks,
      completed,
    }
    if (!study.online) {
      await study.enqueue({ kind: 'progress', path: `/api/learn/lessons/${lessonId}/progress`, method: 'PUT', body })
      setSaved('Saved on this phone. It will sync when you are back online.')
      return
    }
    const key = await study.enqueue({
      kind: 'progress',
      path: `/api/learn/lessons/${lessonId}/progress`,
      method: 'PUT',
      body,
    })
    await study.flush()
    setSaved(completed ? `Lesson marked. Sync key ${key.slice(0, 12)}.` : 'Progress sent.')
  }

  function revealMore() {
    if (!lesson) return
    if (!atEndOfSlide) {
      const next = revealed + 1
      setRevealed(next)
      void persist(slideIndex, next, checks, false)
      return
    }
    if (!lastSlide) {
      const nextIndex = slideIndex + 1
      setSlideIndex(nextIndex)
      setRevealed(1)
      void persist(nextIndex, 1, checks, false)
      return
    }
    const required = lesson.slides.flatMap((item) => item.blocks ?? []).filter((block) => block.type === 'check')
    const passed = required.every((block) => checks[block.id || '']?.correct === true)
    void persist(slideIndex, revealed, checks, passed)
  }

  function answer(block: LessonBlock, optionId: string) {
    const id = block.id || block.prompt || 'check'
    const correct = optionId === block.correctId
    const next = { ...checks, [id]: { correct } }
    setChecks(next)
    void persist(slideIndex, revealed, next, false)
  }

  async function download() {
    if (!token || !lessonId || !lesson) return
    await study.saveDownload({
      kind: 'lesson',
      remoteId: lessonId,
      title: lesson.title,
      payload: JSON.stringify(lesson),
    })
    await study.saveDownload({
      kind: 'notes',
      remoteId: lessonId,
      title: `${lesson.title} notes`,
      payload: JSON.stringify({ title: lesson.title, slides: lesson.slides }),
    })
    setSaved('Lesson and notes saved on this phone.')
  }

  return (
    <Screen>
      <Title subtitle={lesson?.description}>{lesson?.title ?? 'Lesson'}</Title>
      {offlineCopy ? <Note>Opened from this phone. Progress will sync later.</Note> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {lesson ? <Button label="Save for offline" tone="ghost" onPress={() => void download()} /> : null}
      {slide ? (
        <Card>
          <Text style={styles.kicker}>
            Slide {slideIndex + 1} of {lesson?.slides.length ?? 1}
          </Text>
          <Text style={styles.slideTitle}>{slide.title}</Text>
          {visible.map((block, index) => (
            <LessonBlockView
              block={block}
              checks={checks}
              key={block.id || `${slideIndex}-${index}`}
              onAnswer={answer}
            />
          ))}
          <Button label={lastSlide && atEndOfSlide ? 'Finish lesson' : 'Continue'} onPress={revealMore} />
        </Card>
      ) : null}
      {saved ? <Note>{saved}</Note> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  kicker: { color: '#3444DA', fontSize: 12, fontWeight: '700' },
  slideTitle: { color: '#142033', fontSize: 20, fontWeight: '700' },
})
