import { useState } from 'react'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'

import { prettyLatex, videoTarget, type PlainBlock } from '@/lib/policies'
import { colors } from '@/ui/screen'

export type LessonBlock = PlainBlock & {
  id?: string
  url?: string
  alt?: string
  language?: string
  variant?: string
  tone?: string
  options?: { id: string; label: string }[]
  correctId?: string
  headers?: string[]
  rows?: string[][]
  explanation?: string
  feedbackCorrect?: string
  feedbackWrong?: string
}

export function LessonBlockView({
  block,
  checks,
  onAnswer,
}: {
  block: LessonBlock
  checks: Record<string, { correct?: boolean }>
  onAnswer: (block: LessonBlock, optionId: string) => void
}) {
  if (block.type === 'text') {
    if (block.variant === 'list') {
      return (
        <View style={styles.block}>
          {(block.items ?? []).map((item) => (
            <Text key={item} style={styles.body}>
              • {item}
            </Text>
          ))}
        </View>
      )
    }
    const style = block.variant === 'heading' ? styles.heading : block.variant === 'quote' ? styles.quote : styles.body
    return <Text style={style}>{block.text}</Text>
  }
  if (block.type === 'code') {
    return (
      <View style={styles.codeBox}>
        {block.language ? <Text style={styles.kicker}>{block.language}</Text> : null}
        <Text style={styles.code}>{block.code}</Text>
      </View>
    )
  }
  if (block.type === 'image' && block.url) {
    return (
      <View style={styles.block}>
        <Image
          accessibilityLabel={block.alt || 'Lesson illustration'}
          source={{ uri: block.url }}
          style={styles.image}
        />
        {block.caption ? <Text style={styles.caption}>{block.caption}</Text> : null}
      </View>
    )
  }
  if (block.type === 'callout') {
    return (
      <View style={styles.callout}>
        <Text style={styles.kicker}>{block.tone || 'Note'}</Text>
        <Text style={styles.body}>{block.text}</Text>
      </View>
    )
  }
  if (block.type === 'video') return <VideoBlock title={block.title} url={block.url || ''} caption={block.caption} />
  if (block.type === 'table') {
    const headers = block.headers?.length ? block.headers : []
    return (
      <View style={styles.block}>
        {block.caption ? <Text style={styles.caption}>{block.caption}</Text> : null}
        {headers.length ? <Text style={styles.kicker}>{headers.join(' · ')}</Text> : null}
        {(block.rows ?? []).map((row, index) => (
          <Text key={`${index}-${row.join('|')}`} style={styles.body}>
            {row.join(' · ')}
          </Text>
        ))}
      </View>
    )
  }
  if (block.type === 'audio') {
    return (
      <View style={styles.block}>
        <Text style={styles.body}>{block.title || 'Audio note'}</Text>
        {block.transcript ? <Text style={styles.caption}>{block.transcript}</Text> : null}
        {block.url ? (
          <Pressable onPress={() => void Linking.openURL(block.url || '')}>
            <Text style={styles.link}>Play audio</Text>
          </Pressable>
        ) : (
          <Text style={styles.caption}>This audio note has no file yet.</Text>
        )}
      </View>
    )
  }
  if (block.type === 'math') {
    return (
      <View style={styles.math}>
        <Text style={styles.mathText}>{prettyLatex(block.latex || '') || 'Formula'}</Text>
        {block.caption ? <Text style={styles.caption}>{block.caption}</Text> : null}
      </View>
    )
  }
  if (block.type === 'flashcard') return <Flashcard front={block.front} back={block.back} />
  if (block.type === 'check' || block.type === 'quiz') {
    const id = block.id || block.prompt || 'check'
    const result = checks[id]
    return (
      <View style={styles.block}>
        <Text style={styles.body}>{block.prompt}</Text>
        {block.options?.map((option) => (
          <Pressable key={option.id} onPress={() => onAnswer({ ...block, id }, option.id)}>
            <Text style={styles.option}>{option.label}</Text>
          </Pressable>
        ))}
        {result ? (
          <Text style={result.correct ? styles.good : styles.bad}>
            {result.correct ? block.feedbackCorrect || 'Correct.' : block.feedbackWrong || 'Not quite.'}{' '}
            {block.explanation || ''}
          </Text>
        ) : null}
      </View>
    )
  }
  if (block.type === 'game') {
    return (
      <Text style={styles.caption}>
        This lesson includes a game. Open it on the website while the phone build catches up.
      </Text>
    )
  }
  return null
}

function VideoBlock({ url, title, caption }: { url: string; title?: string; caption?: string }) {
  const target = videoTarget(url)
  if (!target) return <Text style={styles.caption}>Add a video URL to show this player.</Text>
  if (target.kind === 'youtube') {
    return (
      <View style={styles.block}>
        {title ? <Text style={styles.body}>{title}</Text> : null}
        <Pressable onPress={() => void Linking.openURL(target.href)}>
          <Text style={styles.link}>Play video</Text>
        </Pressable>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    )
  }
  return <FileVideo caption={caption} title={title} url={target.href} />
}

function FileVideo({ url, title, caption }: { url: string; title?: string; caption?: string }) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false
  })
  return (
    <View style={styles.block}>
      {title ? <Text style={styles.body}>{title}</Text> : null}
      <VideoView nativeControls player={player} style={styles.video} />
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  )
}

function Flashcard({ front, back }: { front?: string; back?: string }) {
  const [flipped, setFlipped] = useState(false)
  return (
    <Pressable onPress={() => setFlipped((value) => !value)} style={styles.math}>
      <Text style={styles.kicker}>{flipped ? 'Back' : 'Front'}</Text>
      <Text style={styles.body}>{flipped ? back || 'Add the answer' : front || 'Add the prompt'}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  heading: { color: colors.ink, fontSize: 20, fontWeight: '700', lineHeight: 26 },
  quote: {
    borderLeftColor: colors.violet,
    borderLeftWidth: 3,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
    paddingLeft: 10,
  },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  kicker: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  codeBox: { backgroundColor: '#101828', borderRadius: 12, gap: 6, padding: 12 },
  code: { color: '#F8FAFC', fontFamily: 'monospace', fontSize: 13, lineHeight: 18 },
  image: { borderRadius: 12, height: 180, width: '100%' },
  video: { borderRadius: 12, height: 200, width: '100%' },
  callout: { backgroundColor: '#EEF1FF', borderRadius: 12, gap: 4, padding: 12 },
  math: { backgroundColor: '#F8F5FF', borderRadius: 12, gap: 4, padding: 12 },
  mathText: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  option: { color: colors.accent, fontSize: 15, paddingVertical: 4 },
  link: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  good: { color: colors.accent, fontSize: 14 },
  bad: { color: colors.danger, fontSize: 14 },
})
