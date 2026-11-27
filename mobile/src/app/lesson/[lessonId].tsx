import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useLocalSearchParams } from 'expo-router'

import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { Button, Card, ErrorText, Screen, Title, colors } from '@/ui/screen'

type Block = {
  id: string
  type: string
  text?: string
  code?: string
  prompt?: string
  options?: { id: string; label: string }[]
  correctId?: string
  notesOnly?: boolean
}
type Slide = { id: string; title: string; blocks?: Block[] }
type Lesson = {
  title: string
  description: string
  slides: Slide[]
  progress: { currentSlideIndex: number; checkResults: Record<string, { correct?: boolean }>; completed: boolean }
}

export default function LessonScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>()
  const { token } = useSession()
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [revealed, setRevealed] = useState(1)
  const [checks, setChecks] = useState<Record<string, { correct?: boolean }>>({})
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    if (!token || !lessonId) return
    void api<{ item: Lesson }>(`/api/learn/lessons/${lessonId}`, {}, token).then((result) => {
      if (!result.ok) {
        setError(result.message)
        return
      }
      setLesson(result.data.item)
      setSlideIndex(result.data.item.progress?.currentSlideIndex ?? 0)
      setChecks(result.data.item.progress?.checkResults ?? {})
    })
  }, [lessonId, token])

  const slide = lesson?.slides[slideIndex]
  const blocks = (slide?.blocks ?? []).filter((block) => !block.notesOnly)
  const visible = blocks.slice(0, revealed)
  const atEndOfSlide = revealed >= blocks.length
  const lastSlide = lesson ? slideIndex >= lesson.slides.length - 1 : false

  async function persist(nextIndex: number, nextRevealed: number, nextChecks: typeof checks, completed: boolean) {
    if (!token || !lessonId) return
    const result = await api(`/api/learn/lessons/${lessonId}/progress`, {
      method: 'PUT',
      body: JSON.stringify({
        current_slide_index: nextIndex,
        revealed_units: nextRevealed,
        check_results: nextChecks,
        completed,
      }),
    }, token)
    setSaved(result.ok ? (completed ? 'Lesson complete.' : 'Progress saved.') : result.message)
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
    const required = (lesson.slides.flatMap((item) => item.blocks ?? [])).filter((block) => block.type === 'check')
    const passed = required.every((block) => checks[block.id]?.correct === true)
    void persist(slideIndex, revealed, checks, passed)
  }

  function answer(block: Block, optionId: string) {
    const correct = optionId === block.correctId
    const next = { ...checks, [block.id]: { correct } }
    setChecks(next)
    void persist(slideIndex, revealed, next, false)
  }

  return (
    <Screen>
      <Title subtitle={lesson?.description}>{lesson?.title ?? 'Lesson'}</Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {slide ? (
        <Card>
          <Text style={styles.kicker}>
            Slide {slideIndex + 1} of {lesson?.slides.length ?? 1}
          </Text>
          <Text style={styles.slideTitle}>{slide.title}</Text>
          {visible.map((block) => (
            <View key={block.id} style={styles.block}>
              {block.type === 'code' ? <Text style={styles.code}>{block.code}</Text> : null}
              {block.type === 'check' ? (
                <>
                  <Text style={styles.body}>{block.prompt}</Text>
                  {block.options?.map((option) => (
                    <Pressable key={option.id} onPress={() => answer(block, option.id)}>
                      <Text style={styles.option}>{option.label}</Text>
                    </Pressable>
                  ))}
                  {checks[block.id] ? (
                    <Text style={checks[block.id]?.correct ? styles.good : styles.bad}>
                      {checks[block.id]?.correct ? 'Correct' : 'Try another answer'}
                    </Text>
                  ) : null}
                </>
              ) : block.type !== 'code' ? (
                <Text style={styles.body}>{block.text || block.prompt || `${block.type} block`}</Text>
              ) : null}
            </View>
          ))}
          <Button
            label={atEndOfSlide ? (lastSlide ? 'Finish lesson' : 'Next slide') : 'Next point'}
            onPress={() => void revealMore()}
          />
          {saved ? <Text style={styles.saved}>{saved}</Text> : null}
        </Card>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  kicker: { color: colors.muted, fontSize: 13 },
  slideTitle: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  block: { gap: 6 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  code: {
    backgroundColor: '#142033',
    borderRadius: 10,
    color: '#E7F6F2',
    fontFamily: 'monospace',
    padding: 12,
  },
  option: { color: colors.accent, fontSize: 16, paddingVertical: 4 },
  good: { color: colors.accent, fontWeight: '700' },
  bad: { color: colors.danger, fontWeight: '700' },
  saved: { color: colors.muted, fontSize: 13 },
})
