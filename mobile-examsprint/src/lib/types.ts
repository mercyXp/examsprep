export type SessionUser = { id: string; name: string; email: string; roles: string[] }

export type AuthResponse = { access_token: string; user: SessionUser }

export type Subject = {
  id: string
  name: string
  code: string
  questionCount: number
  available: number
  source: 'practice' | 'bank'
  blurb: string
}

export type Choice = { id: string; letter: string; label: string }

export type ReviewCard = {
  prompt: string
  correct: boolean
  letter: string | null
  points: number
  speedBonus: number
  explanation: string
  correctLabel: string
}

export type Achievement = { code: string; title: string; detail: string; new?: boolean; unlocked?: boolean }

export type SprintState = {
  sessionId: string
  status: 'playing' | 'finished'
  phase: 'question' | 'round_break' | 'finished'
  outcome: string | null
  subject: string
  source: string
  round: number
  rounds: number
  questionNumber: number
  questionCount: number
  score: number
  speedBonus: number
  correct: number
  streak: number
  moves: number
  limitMs: number | null
  remainingMs: number | null
  canAnswer: boolean
  canContinue: boolean
  question: { prompt: string; number: number; choices: Choice[] } | null
  lastResult: {
    correct: boolean
    points: number
    speedBonus: number
    letter: string | null
    explanation: string
    correctLabel: string
  } | null
  roundSummary: { round: number; correct: number; questions: number; points: number } | null
  review: ReviewCard[]
  achievements: Achievement[]
}

export type BoardEntry = {
  rank: number
  displayName: string
  playerKind: 'human' | 'agent'
  score: number
  speedBonus: number
  correct: number
  questionCount: number
  subject: string
}

export type ArenaRow = {
  callsign?: string
  game?: string
  wins?: number
  best?: number
  scoreLabel?: string
  played?: number
}
