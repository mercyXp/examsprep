import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'

import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { Card, ErrorText, Screen, Title, colors } from '@/ui/screen'

type LessonRow = { id: string; title: string; completed: boolean }
type Chapter = { id: string; title: string; lessons: LessonRow[] }
type ModuleDetail = { code: string; name: string; description: string; chapters: Chapter[] }

export default function CourseScreen() {
  const { moduleId } = useLocalSearchParams<{ moduleId: string }>()
  const { token } = useSession()
  const [item, setItem] = useState<ModuleDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token || !moduleId) return
    void api<{ item: ModuleDetail }>(`/api/learn/modules/${moduleId}`, {}, token).then((result) => {
      if (!result.ok) setError(result.message)
      else setItem(result.data.item)
    })
  }, [moduleId, token])

  return (
    <Screen>
      <Title subtitle={item?.description || 'Published lessons in this course.'}>{item ? `${item.code} ${item.name}` : 'Course'}</Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {item?.chapters.map((chapter) => (
        <Card key={chapter.id}>
          <Text style={styles.chapter}>{chapter.title}</Text>
          {chapter.lessons.map((lesson) => (
            <Pressable key={lesson.id} onPress={() => router.push(`/lesson/${lesson.id}`)}>
              <Text style={styles.lesson}>
                {lesson.completed ? 'Done · ' : ''}
                {lesson.title}
              </Text>
            </Pressable>
          ))}
          {chapter.lessons.length === 0 ? <Text style={styles.empty}>No published lessons in this unit.</Text> : null}
        </Card>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  chapter: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  lesson: { color: colors.accent, fontSize: 16, paddingVertical: 6 },
  empty: { color: colors.muted, fontSize: 14 },
})
