import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { router } from 'expo-router'

import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { Card, ErrorText, Screen, Title, colors } from '@/ui/screen'

type ModuleRow = {
  id: string
  code: string
  name: string
  progressPercent: number
  completedLessons: number
  totalLessons: number
}

export default function CoursesScreen() {
  const { token } = useSession()
  const [items, setItems] = useState<ModuleRow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    void api<{ items: ModuleRow[] }>('/api/learn/modules', {}, token).then((result) => {
      if (!result.ok) setError(result.message)
      else setItems(result.data.items ?? [])
    })
  }, [token])

  return (
    <Screen>
      <Title subtitle="Only published modules you are allowed to study.">My Courses</Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {items.length === 0 && !error ? (
        <Card>
          <Text style={styles.body}>
            No courses yet. Finish onboarding on the website, or ask an administrator to publish a module.
          </Text>
        </Card>
      ) : null}
      {items.map((module) => (
        <Pressable key={module.id} onPress={() => router.push(`/course/${module.id}`)}>
          <Card>
            <Text style={styles.code}>{module.code}</Text>
            <Text style={styles.name}>{module.name}</Text>
            <Text style={styles.body}>
              {module.completedLessons}/{module.totalLessons} lessons · {module.progressPercent}%
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  code: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  name: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 14 },
})
