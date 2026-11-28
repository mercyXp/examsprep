import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, type PressableProps } from 'react-native'

import { useStudyData } from '@/features/offline/study-data'

export const colors = {
  bg: '#F4F6FB',
  card: '#FFFFFF',
  ink: '#142033',
  muted: '#5C6B73',
  accent: '#3444DA',
  violet: '#7B5CFF',
  line: '#E2E6F2',
  gold: '#8A6420',
  danger: '#9B2C2C',
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={styles.screen} style={{ backgroundColor: colors.bg }}>
      <ConnectionNote />
      {children}
    </ScrollView>
  )
}

function ConnectionNote() {
  const study = useStudyData()
  if (!study.ready) return null
  if (study.online && study.pending === 0) return null
  const label = study.online
    ? `${study.pending} saved change${study.pending === 1 ? '' : 's'} waiting to sync.`
    : study.pending > 0
      ? `Offline. ${study.pending} change${study.pending === 1 ? '' : 's'} will sync when you reconnect.`
      : 'Offline. Saved lessons and quizzes on this phone still open.'
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>{label}</Text>
    </View>
  )
}

export function Title({ children, subtitle }: { children: string; subtitle?: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text style={styles.title}>{children}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>
}

export function Button({
  label,
  onPress,
  tone = 'accent',
  disabled,
}: {
  label: string
  onPress: PressableProps['onPress']
  tone?: 'accent' | 'ghost'
  disabled?: boolean
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, tone === 'ghost' && styles.buttonGhost, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonLabel, tone === 'ghost' && styles.buttonLabelGhost]}>{label}</Text>
    </Pressable>
  )
}

export function ErrorText({ children }: { children: string }) {
  return <Text style={styles.error}>{children}</Text>
}

export function Note({ children }: { children: string }) {
  return <Text style={styles.note}>{children}</Text>
}

const styles = StyleSheet.create({
  screen: { padding: 20, paddingBottom: 48, gap: 14 },
  titleBlock: { gap: 6, marginBottom: 4 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
  },
  buttonGhost: { backgroundColor: 'transparent', borderColor: colors.line, borderWidth: 1 },
  buttonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  buttonLabelGhost: { color: colors.ink },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  note: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  banner: {
    backgroundColor: '#E8ECFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerText: { color: colors.accent, fontSize: 14, fontWeight: '600', lineHeight: 20 },
})
