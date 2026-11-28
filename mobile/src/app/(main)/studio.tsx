import { Pressable, StyleSheet, Text } from 'react-native'
import { router } from 'expo-router'

import { Card, Screen, Title, colors } from '@/ui/screen'

const ITEMS = [
  {
    href: '/(main)/snap',
    title: 'Snap a question',
    body: 'Photograph a problem, crop it, and ask for an explanation.',
  },
  { href: '/(main)/tutor', title: 'AI tutor', body: 'Record a question and play the spoken reply.' },
  {
    href: '/(main)/audio',
    title: 'Listen to a lesson',
    body: 'Turn a published lesson into audio you can seek through.',
  },
] as const

export default function StudioScreen() {
  return (
    <Screen>
      <Title subtitle="These call the AI routes. If a route is not deployed yet, the screen says so. It does not invent an answer.">
        AI studio
      </Title>
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
