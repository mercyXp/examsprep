import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, type PressableProps } from 'react-native'

export const colors = {
  bg: '#F3F6F4',
  card: '#FFFFFF',
  ink: '#142033',
  muted: '#5C6B73',
  accent: '#0E6B62',
  line: '#E2E8E4',
  gold: '#8A6420',
  danger: '#9B2C2C',
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={styles.screen} style={{ backgroundColor: colors.bg }}>
      {children}
    </ScrollView>
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
})
