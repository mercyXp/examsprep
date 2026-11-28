import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export const colors = {
  bg: '#07111F',
  card: '#12263F',
  card2: '#0C1B2E',
  line: 'rgba(255,255,255,0.08)',
  amber: '#FFB703',
  mint: '#2EE6A6',
  coral: '#FF5D73',
  ink: '#F4F7FB',
  muted: '#93A4BD',
  inkDark: '#102033',
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.inner}>{children}</View>
    </SafeAreaView>
  )
}

export function Title({ kicker, children, subtitle }: { kicker?: string; children: string; subtitle?: string }) {
  return (
    <View style={styles.titleBlock}>
      {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      <Text style={styles.title}>{children}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  )
}

export function Button({
  label,
  onPress,
  tone = 'primary',
  disabled,
}: {
  label: string
  onPress: () => void
  tone?: 'primary' | 'ghost' | 'mint'
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'primary' ? styles.primary : tone === 'mint' ? styles.mint : styles.ghost,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={[styles.buttonText, tone === 'primary' ? styles.primaryText : styles.lightText]}>{label}</Text>
    </Pressable>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, paddingHorizontal: 20, paddingBottom: 24 },
  titleBlock: { gap: 6, marginBottom: 18 },
  kicker: { color: colors.amber, fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  title: { color: colors.ink, fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  button: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  primary: { backgroundColor: colors.amber },
  mint: { backgroundColor: colors.mint },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  buttonText: { fontSize: 16, fontWeight: '800' },
  primaryText: { color: colors.inkDark },
  lightText: { color: colors.ink },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 10,
  },
})
