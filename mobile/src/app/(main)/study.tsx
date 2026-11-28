import { Pressable, StyleSheet, Text } from 'react-native'
import { router } from 'expo-router'

import { Card, Screen, Title, colors } from '@/ui/screen'

const ITEMS = [
  { href: '/(main)/quizzes', title: 'Quizzes', body: 'Published practice questions.' },
  { href: '/(main)/mocks', title: 'Mock exams', body: 'Timed papers. A pass can be claimed as a badge.' },
  {
    href: '/(main)/planner',
    title: 'Revision planner',
    body: 'Exam dates from your account, plus a generated plan when the API has one.',
  },
  {
    href: '/(main)/audio',
    title: 'Audio learning',
    body: 'Lesson speech with seek and speed, including background playback.',
  },
] as const

export default function StudyScreen() {
  return (
    <Screen>
      <Title subtitle="Practice, mocks, and the plan for the weeks ahead.">Study</Title>
      {ITEMS.map((item) => (
        <Pressable key={item.href} onPress={() => router.push(item.href)}>
          <Card>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
})
