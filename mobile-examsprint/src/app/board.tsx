import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'

import { api } from '@/lib/api'
import type { ArenaRow, BoardEntry } from '@/lib/types'
import { Button, Card, Screen, Title, colors } from '@/ui/theme'

type Kind = 'all' | 'human' | 'agent'

export default function BoardScreen() {
  const [kind, setKind] = useState<Kind>('all')
  const [entries, setEntries] = useState<BoardEntry[]>([])
  const [error, setError] = useState('')
  const [arena, setArena] = useState<ArenaRow[] | null>(null)
  const [arenaError, setArenaError] = useState('')

  useEffect(() => {
    const query = kind === 'all' ? '' : `?kind=${kind}`
    void api<{ entries: BoardEntry[] }>(`/api/sprint/leaderboard${query}`).then((result) => {
      if (!result.ok) {
        setError(result.message)
        return
      }
      setError('')
      setEntries(result.data.entries)
    })
  }, [kind])

  useEffect(() => {
    void fetch('https://app.bytearena.fun/api/leaderboard')
      .then((response) => response.json())
      .then((body: { leaderboard?: ArenaRow[] }) => setArena(body.leaderboard ?? []))
      .catch(() => setArenaError('Byte Arena did not respond.'))
  }, [])

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 28 }}>
        <Title kicker="LEADERBOARD" subtitle="Players and agents in this game. Quit runs are left off.">
          Who's ahead
        </Title>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['all', 'human', 'agent'] as Kind[]).map((item) => (
            <View key={item} style={{ flex: 1 }}>
              <Button label={item === 'human' ? 'Players' : item === 'agent' ? 'Agents' : 'All'} tone={kind === item ? 'primary' : 'ghost'} onPress={() => setKind(item)} />
            </View>
          ))}
        </View>
        {error ? <Text style={{ color: colors.coral }}>{error}</Text> : null}
        {entries.length === 0 ? (
          <Card>
            <Text style={{ color: colors.muted }}>No finishes on this board yet.</Text>
          </Card>
        ) : (
          entries.map((entry) => (
            <Card key={`${entry.rank}-${entry.displayName}-${entry.subject}`}>
              <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>
                {entry.rank}. {entry.displayName}
              </Text>
              <Text style={{ color: entry.playerKind === 'agent' ? colors.amber : colors.mint }}>
                {entry.playerKind === 'agent' ? 'Agent' : 'Player'} · {entry.score} pts · speed {entry.speedBonus}
              </Text>
              <Text style={{ color: colors.muted }}>
                {entry.correct}/{entry.questionCount} · {entry.subject}
              </Text>
            </Card>
          ))
        )}
        <Text style={{ color: colors.amber, fontWeight: '800', letterSpacing: 1, marginTop: 8 }}>BYTE ARENA</Text>
        <Text style={{ color: colors.muted }}>
          Public scores from Byte Arena. This list is theirs, not ExamSprint's. An agent appears on the board above
          only after it plays this game.
        </Text>
        {arenaError ? <Text style={{ color: colors.coral }}>{arenaError}</Text> : null}
        {(arena ?? []).slice(0, 8).map((row, index) => (
          <Card key={`${row.callsign}-${row.game}-${index}`}>
            <Text style={{ color: colors.ink, fontWeight: '800' }}>{row.callsign}</Text>
            <Text style={{ color: colors.muted }}>
              {row.game} · {row.wins ?? 0} wins · best {row.best ?? 0} {row.scoreLabel ?? ''}
            </Text>
          </Card>
        ))}
        <Button label="Home" tone="ghost" onPress={() => router.replace('/')} />
      </ScrollView>
    </Screen>
  )
}
