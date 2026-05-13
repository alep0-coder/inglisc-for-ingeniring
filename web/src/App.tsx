import './App.css'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { App as CapApp } from '@capacitor/app'
import type { Exercise, UnitDatabase } from './types'
import { loadDatabase } from './loadDatabase'
import { lessonKey, loadProgress, saveProgress, uploadProgress, downloadProgress } from './storage'
import { auth } from './firebase'
import { onAuthStateChanged, type User, signOut } from 'firebase/auth'
import AuthOverlay from './components/AuthOverlay'

// ─── Types ────────────────────────────────────────────────────────────────────
type FeedbackState = 'idle' | 'correct' | 'incorrect'

const SUCCESS_MESSAGES = ['Great job! 🎉', 'Correct! ✨', 'Perfect! 🌟', 'Well done! 💪', 'Fantastic! 🚀']
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const MAX_LIVES = 5

// ─── Helpers ──────────────────────────────────────────────────────────────────
function randomSuccess() {
  return SUCCESS_MESSAGES[Math.floor(Math.random() * SUCCESS_MESSAGES.length)]
}

function normalise(s: string) {
  return s.trim().toLowerCase().replace(/['']/g, "'")
}

function renderMarkdown(text: string) {
  if (!text) return ''
  let html = text
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^\* (.*$)/gm, '<li>$1</li>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .split('\n\n')
    .map(p => {
      const trimmed = p.trim()
      if (trimmed.startsWith('<h') || trimmed.startsWith('<li')) return trimmed
      return `<p>${p.replace(/\n/g, '<br/>')}</p>`
    })
    .join('\n')

  // Wrap adjacent <li> tags in <ul>
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
  html = html.replace(/<\/ul>\s*<ul>/g, '')
  
  return html
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ExerciseHeader({ lives, progress, theme, toggleTheme }: { lives: number; progress: number; theme: 'light' | 'dark' | 'system'; toggleTheme: () => void }) {
  return (
    <div className="exercise-header">
      <div className="lives-badge">
        <span className="heart-icon">❤️</span>
        <span>{lives}</span>
      </div>
      <div className="progress-bar-wrap" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>
      <ThemeToggle theme={theme} toggleTheme={toggleTheme} isCompact />
    </div>
  )
}

function ThemeToggle({ theme, toggleTheme, isCompact = false }: { theme: 'light' | 'dark' | 'system'; toggleTheme: () => void; isCompact?: boolean }) {
  const getIcon = () => {
    if (theme === 'system') return '🖥️'
    return theme === 'light' ? '☀️' : '🌙'
  }
  
  const getTitle = () => {
    if (theme === 'system') return 'System Theme'
    return theme === 'light' ? 'Light Mode' : 'Dark Mode'
  }

  return (
    <button 
      className={`theme-toggle ${isCompact ? 'compact' : ''}`} 
      onClick={toggleTheme} 
      title={getTitle()}
    >
      {getIcon()}
    </button>
  )
}

function BottomSheet({
  state,
  correctAnswer,
  explanation,
  successMessage,
  onAction,
}: {
  state: FeedbackState
  correctAnswer?: string
  explanation?: string
  successMessage: string
  onAction: () => void
}) {
  const isOpen = state !== 'idle'
  const isCorrect = state === 'correct'

  return (
    <>
      <div className={`bottom-sheet ${isOpen ? 'open' : ''} ${isCorrect ? 'correct' : 'incorrect'}`}>
        {isCorrect ? (
          <>
            <span className="sheet-icon">🎉</span>
            <p className="sheet-title">{successMessage}</p>
          </>
        ) : (
          <>
            <span className="sheet-icon">💔</span>
            <p className="sheet-title">Not quite...</p>
            {correctAnswer && (
              <>
                <p className="sheet-label">Correct answer:</p>
                <p className="sheet-answer">{correctAnswer}</p>
              </>
            )}
            {explanation && (
              <>
                <p className="sheet-label">Explanation:</p>
                <p className="sheet-explanation">{explanation}</p>
              </>
            )}
          </>
        )}
      </div>

      <div className="cta-area" style={{ zIndex: isOpen ? 201 : 100 }}>
        {isOpen ? (
          <button
            id="sheet-cta-btn"
            className={`cta-btn ${isCorrect ? 'continue-green' : 'continue-red'}`}
            onClick={onAction}
          >
            {isCorrect ? 'Continue' : 'Got it'}
          </button>
        ) : null}
      </div>
    </>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [db, setDb] = useState<UnitDatabase | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState('')

  // Matching state
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null)
  const [selectedDef, setSelectedDef] = useState<string | null>(null)
  const [matchedTerms, setMatchedTerms] = useState<string[]>([])
  const [shuffledDefs, setShuffledDefs] = useState<{text: string, id: number}[]>([])

  const [unitIdx, setUnitIdx] = useState<number | null>(null)
  const [lessonIdx, setLessonIdx] = useState<number | null>(null)

  // Game state
  const [lives, setLives] = useState(MAX_LIVES)
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('idle')
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null)
  const [textAnswers, setTextAnswers] = useState<string[]>([])
  const [lessonComplete, setLessonComplete] = useState(false)
  const [wrongCount, setWrongCount] = useState(0)
  const [viewingTheory, setViewingTheory] = useState(false)
  const [isReviewHub, setIsReviewHub] = useState(false)

  // Auth & Sync state
  const [user, setUser] = useState<User | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const optionsRef = useRef<HTMLDivElement>(null)

  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved
    return 'system'
  })

  useEffect(() => {
    const applyTheme = () => {
      let effectiveTheme = theme
      if (theme === 'system') {
        effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      }
      document.body.classList.toggle('dark', effectiveTheme === 'dark')
    }

    applyTheme()
    localStorage.setItem('theme', theme)

    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const listener = () => applyTheme()
      media.addEventListener('change', listener)
      return () => media.removeEventListener('change', listener)
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'dark'
      if (prev === 'dark') return 'system'
      return 'light'
    })
  }

  const [progress, setProgress] = useState(loadProgress())

  useEffect(() => {
    loadDatabase()
      .then(setDb)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  // Handle Auth Changes
  useEffect(() => {
    if (!auth) return
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      if (currentUser) {
        setIsSyncing(true)
        try {
          // Only download if we haven't synced in this session to avoid loops
          if (!sessionStorage.getItem('synced')) {
            const remote = await downloadProgress(currentUser.uid)
            if (remote) {
              setProgress(remote)
              sessionStorage.setItem('synced', 'true')
            }
          }
        } finally {
          setIsSyncing(false)
        }
      } else {
        sessionStorage.removeItem('synced')
      }
    })
    return () => unsubscribe()
  }, [])

  const handleManualSync = async () => {
    if (!user || !auth) return
    setIsSyncing(true)
    try {
      const current = loadProgress()
      await uploadProgress(user.uid, current)
      const remote = await downloadProgress(user.uid)
      if (remote) setProgress(remote)
    } finally {
      setIsSyncing(false)
    }
  }

  // Ref to hold latest state for back gesture
  const stateRef = useRef({ unitIdx, lessonIdx, feedbackState, lessonComplete })
  useEffect(() => {
    stateRef.current = { unitIdx, lessonIdx, feedbackState, lessonComplete }
  }, [unitIdx, lessonIdx, feedbackState, lessonComplete])

  useEffect(() => {
    let listenerHandle: Awaited<ReturnType<typeof CapApp.addListener>> | null = null

    CapApp.addListener('backButton', () => {
      const state = stateRef.current
      if (state.feedbackState !== 'idle') {
        setFeedbackState('idle')
      } else if (state.lessonComplete) {
        setLessonIdx(null)
        setLives(MAX_LIVES)
        resetExerciseState()
      } else if (state.lessonIdx !== null) {
        if (viewingTheory) {
          setLessonIdx(null)
          setViewingTheory(false)
        } else {
          setLessonIdx(null)
          resetExerciseState()
        }
      } else if (state.unitIdx !== null) {
        setUnitIdx(null)
      } else {
        CapApp.exitApp()
      }
    }).then((h) => {
      listenerHandle = h
    })

    return () => {
      listenerHandle?.remove()
    }
  }, [])

  const unit = db && unitIdx !== null ? db.units[unitIdx] : null
  const lesson = unit && lessonIdx !== null ? unit.lessons[lessonIdx] : null
  const lKey = unitIdx !== null && lessonIdx !== null ? lessonKey(unitIdx, lessonIdx) : null
  const nextIndex = lKey ? (progress.lessonNextIndex[lKey] ?? 0) : 0
  const exercise: Exercise | null = lesson ? (lesson.exercises[nextIndex] ?? null) : null

  // Computed progress % for this lesson
  const lessonProgress = lesson
    ? Math.round((Math.min(nextIndex, lesson.exercises.length) / lesson.exercises.length) * 100)
    : 0

  const stats = useMemo(() => {
    const units = db?.units?.length ?? 0
    const lessons = db?.units?.reduce((acc, u) => acc + (u.lessons?.length ?? 0), 0) ?? 0
    const exercises =
      db?.units?.reduce(
        (acc, u) => acc + (u.lessons?.reduce((a2, l) => a2 + (l.exercises?.length ?? 0), 0) ?? 0),
        0,
      ) ?? 0
    return { units, lessons, exercises }
  }, [db])

  // Initialize state when exercise changes
  useEffect(() => {
    if (exercise?.type === 'fill_in_the_blank') {
      setTextAnswers(new Array(exercise.blanks.length).fill(''))
      inputRefs.current = new Array(exercise.blanks.length).fill(null)
    } else {
      setTextAnswers([])
    }

    if (exercise?.type === 'matching') {
      setSelectedTerm(null)
      setSelectedDef(null)
      setMatchedTerms([])
      const defs = exercise.pairs.map((p, i) => ({ text: p.definition, id: i }))
      setShuffledDefs([...defs].sort(() => Math.random() - 0.5))
    }
  }, [exercise])

  // ── Navigation ──────────────────────────────────────────────────────────────
  function resetExerciseState() {
    setFeedbackState('idle')
    setSelectedOptionIndex(null)
    setTextAnswers([])
    setLessonComplete(false)
    setWrongCount(0)
    setSelectedTerm(null)
    setSelectedDef(null)
    setMatchedTerms([])
  }

  function goHome() {
    setUnitIdx(null)
    setLessonIdx(null)
    setViewingTheory(false)
    setIsReviewHub(false)
    resetExerciseState()
  }

  function goUnit(u: number) {
    setUnitIdx(u)
    setLessonIdx(null)
    setViewingTheory(false)
    resetExerciseState()
  }

  function startLesson(l: number) {
    setLessonIdx(l)
    setLives(MAX_LIVES)
    const k = lessonKey(unitIdx!, l)
    const n = progress.lessonNextIndex[k] ?? 0
    setViewingTheory(n === 0)
    setIsReviewHub(false)
    resetExerciseState()
  }

  function viewTheoryOnly(uIdx: number, lIdx: number) {
    setUnitIdx(uIdx)
    setLessonIdx(lIdx)
    setViewingTheory(true)
    setIsReviewHub(false)
  }

  // ── Game Logic ──────────────────────────────────────────────────────────────
  function advanceExercise() {
    if (!lKey || !lesson) return
    const next = Math.min(nextIndex + 1, lesson.exercises.length)
    const updated = loadProgress()
    updated.lessonNextIndex[lKey] = next
    saveProgress(updated)
    setProgress(updated)

    // Sync to cloud if logged in

    // Sync to cloud if logged in
    if (user) {
      uploadProgress(user.uid, updated)
    }
  }

  const markCorrect = useCallback(() => {
    setSuccessMessage(randomSuccess())
    advanceExercise()
    setFeedbackState('correct')
  }, [nextIndex, lesson, lKey]) // eslint-disable-line

  function triggerShake(target: 'input' | 'options') {
    if (target === 'options' && optionsRef.current) {
      optionsRef.current.classList.remove('shake')
      void optionsRef.current.offsetWidth
      optionsRef.current.classList.add('shake')
      setTimeout(() => optionsRef.current?.classList.remove('shake'), 400)
    } else if (target === 'input') {
      inputRefs.current.forEach(el => {
        if (el) {
          el.classList.remove('shake')
          void el.offsetWidth
          el.classList.add('shake')
          setTimeout(() => el.classList.remove('shake'), 400)
        }
      })
    }
  }

  function markWrong() {
    setLives((prev) => Math.max(0, prev - 1))
    setWrongCount((prev) => prev + 1)
    setFeedbackState('incorrect')
  }

  function handleOptionSelect(idx: number) {
    if (feedbackState !== 'idle') return
    setSelectedOptionIndex(idx)
  }

  function handleCheck() {
    if (!exercise || feedbackState !== 'idle') return

    try {
      if (exercise.type === 'multiple_choice') {
        if (selectedOptionIndex === null || !exercise.options || !exercise.options[selectedOptionIndex]) return
        if (exercise.options[selectedOptionIndex].is_correct) {
          markCorrect()
        } else {
          triggerShake('options')
          markWrong()
        }
      } else if (exercise.type === 'fill_in_the_blank') {
        if (textAnswers.some(ans => !ans.trim()) || !exercise.accepted_answers) return
        
        const normalizedInputs = textAnswers.map(normalise)
        const ok = exercise.accepted_answers.some(ansGroup => {
          if (!ansGroup || ansGroup.length !== normalizedInputs.length) return false
          return ansGroup.every((ans, i) => normalise(ans) === normalizedInputs[i])
        })
        
        if (ok) {
          markCorrect()
        } else {
          triggerShake('input')
          markWrong()
        }
      } else if (exercise.type === 'matching') {
        if (matchedTerms.length === exercise.pairs.length) {
          markCorrect()
        } else {
          triggerShake('options')
          markWrong()
        }
      }
    } catch (err) {
      console.error('Error in handleCheck:', err)
      setError('An error occurred while checking your answer. The exercise data might be incomplete.')
    }
  }

  function handleSheetAction() {
    if (!lesson) return
    if (feedbackState === 'correct' && nextIndex >= lesson.exercises.length) {
      setLessonComplete(true)
      setFeedbackState('idle')
    } else {
      setFeedbackState('idle')
      setSelectedOptionIndex(null)
      setTextAnswers(exercise?.type === 'fill_in_the_blank' ? new Array(exercise.blanks.length).fill('') : [])
    }
  }

  function resetLesson() {
    if (!lKey) return
    const updated = loadProgress()
    updated.lessonNextIndex[lKey] = 0
    saveProgress(updated)
    progress.lessonNextIndex[lKey] = 0
    setLives(MAX_LIVES)
    setViewingTheory(true)
    resetExerciseState()
  }

  // ── CTA button state ────────────────────────────────────────────────────────
  function ctaClass(): string {
    if (feedbackState !== 'idle') return 'cta-btn disabled'
    const hasAnswer =
      exercise?.type === 'multiple_choice'
        ? selectedOptionIndex !== null
        : exercise?.type === 'fill_in_the_blank'
          ? textAnswers.every(ans => ans.trim().length > 0)
          : true
    return hasAnswer ? 'cta-btn active-green' : 'cta-btn disabled'
  }

  function ctaDisabled() {
    if (feedbackState !== 'idle') return false
    if (exercise?.type === 'multiple_choice') return selectedOptionIndex === null
    if (exercise?.type === 'fill_in_the_blank') return textAnswers.some(ans => !ans.trim())
    if (exercise?.type === 'matching') return matchedTerms.length < (exercise.pairs.length)
    return true
  }

  function handleMatchTerm(term: string) {
    if (feedbackState !== 'idle' || matchedTerms.includes(term)) return
    if (selectedTerm === term) {
      setSelectedTerm(null)
      return
    }
    setSelectedTerm(term)
    if (selectedDef !== null) {
      checkMatch(term, selectedDef)
    }
  }

  function handleMatchDef(defText: string) {
    if (feedbackState !== 'idle' || exercise?.type !== 'matching') return
    if (matchedTerms.some(t => exercise.pairs.find(p => p.term === t)?.definition === defText)) return
    if (selectedDef === defText) {
      setSelectedDef(null)
      return
    }
    setSelectedDef(defText)
    if (selectedTerm !== null) {
      checkMatch(selectedTerm, defText)
    }
  }

  function checkMatch(term: string, def: string) {
    if (exercise?.type !== 'matching') return
    const pair = exercise.pairs.find(p => p.term === term)
    if (pair && pair.definition === def) {
      setMatchedTerms(prev => [...prev, term])
      setSelectedTerm(null)
      setSelectedDef(null)
    } else {
      // Wrong match
      triggerShake('options')
      setSelectedTerm(null)
      setSelectedDef(null)
    }
  }

  function getCorrectAnswer(): string {
    if (!exercise) return ''
    if (exercise.type === 'multiple_choice') {
      const correctOpt = exercise.options.find(o => o.is_correct)
      return correctOpt ? correctOpt.text : ''
    }
    if (exercise.type === 'fill_in_the_blank') {
      return exercise.accepted_answers[0].join(' | ')
    }
    return ''
  }

  function getExplanation(): string | undefined {
    if (!exercise) return undefined
    return exercise.explanation
  }

  function updateTextAnswer(index: number, value: string) {
    setTextAnswers(prev => {
      const newAnswers = [...prev]
      newAnswers[index] = value
      return newAnswers
    })
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!db && !error) {
    return (
      <div className="simple-card">
        <h2>⏳ Loading…</h2>
        <p>Reading <code>unit_database.json</code>.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="simple-card">
        <h2>❌ Error</h2>
        <p>{error}</p>
        <p style={{ marginTop: 8 }}>
          Put <code>unit_database.json</code> in <code>web/public/</code> and restart <code>npm run dev</code>.
        </p>
      </div>
    )
  }

  if (!db || db.units.length === 0) {
    return (
      <div className="simple-card">
        <h2>📭 Empty database</h2>
        <p>No units found in <code>unit_database.json</code>.</p>
        <button
          className="cta-btn active-green"
          style={{ marginTop: 16 }}
          onClick={() => location.reload()}
        >
          Reload
        </button>
      </div>
    )
  }

  // ── Revision Hub Screen ─────────────────────────────────────────────────────
  if (isReviewHub) {
    return (
      <div className="screen">
        <div className="crumbs">
          <span className="crumb" onClick={goHome}>🏠 Home</span>
          <span className="crumb-sep">›</span>
          <span className="crumb active">Revision Hub</span>
        </div>

        <div className="home-header">
          <span className="owl">🎓</span>
          <h1>Revision Hub</h1>
          <p>Quickly review all terminology before the exam</p>
        </div>

        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

        {db.units.map((u, ui) => (
          <div key={ui} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--gray-900)', borderBottom: '2px solid var(--gray-200)', paddingBottom: 8, marginBottom: 12 }}>
              {u.title}
            </h2>
            {u.lessons.map((l, li) => (
              <div key={li} className="theory-card" style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--blue)', marginBottom: 8 }}>
                  {l.title}
                </h3>
                <div 
                  className="theory-markdown"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(l.theory) }}
                />
              </div>
            ))}
          </div>
        ))}

        <button className="cta-btn active-green" onClick={goHome}>
          Done
        </button>
      </div>
    )
  }

  // ── Units screen ─────────────────────────────────────────────────────────────
  if (unitIdx === null) {
    return (
      <div className="screen">
        <div className="home-header">
          <span className="owl">🦉</span>
          <h1>Fucking English</h1>
          <p>Your mini-Duolingo from the book</p>
        </div>

        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

        <div className="user-bar">
          {user ? (
            <div className="user-profile">
              <div className="user-avatar">👤</div>
              <div className="user-details">
                <span className="user-name">{user.displayName || user.email?.split('@')[0]}</span>
                <span className={`sync-status ${isSyncing ? 'syncing' : ''}`}>
                  {isSyncing ? 'Synchronizing...' : 'Progress saved'}
                </span>
              </div>
              <div className="user-actions">
                <button className="icon-btn sync-btn" onClick={handleManualSync} title="Sync now" disabled={isSyncing}>
                  {isSyncing ? '⏳' : '🔄'}
                </button>
                <button className="icon-btn logout-btn" onClick={() => auth && signOut(auth)} title="Logout">
                  🚪
                </button>
              </div>
            </div>
          ) : (
            <div className="auth-prompt">
              <p>Sign in to sync your progress across devices</p>
              <button className="cta-btn active-green mini" onClick={() => {
                if (auth) {
                  setShowAuth(true)
                } else {
                  alert("⚠️ Firebase non è configurato. Inserisci le chiavi API in src/firebase.ts per attivare la sincronizzazione.")
                }
              }}>
                Login
              </button>
            </div>
          )}
        </div>

        <div className="stats-pill">
          <span><b>{stats.units}</b> Units</span>
          <span><b>{stats.lessons}</b> Lessons</span>
          <span><b>{stats.exercises}</b> Exercises</span>
        </div>

        <button 
          className="cta-btn active-green" 
          style={{ background: 'var(--blue)', boxShadow: '0 4px 0 0 var(--blue-dark)' }}
          onClick={() => setIsReviewHub(true)}
        >
          🎓 Open Revision Hub
        </button>

        <p className="section-title">Choose a unit</p>

        {db.units.map((u, idx) => {
          const totalEx = u.lessons.reduce((a, l) => a + l.exercises.length, 0)
          const doneEx = u.lessons.reduce((a, l, li) => {
            const k = lessonKey(idx, li)
            return a + Math.min(loadProgress().lessonNextIndex[k] ?? 0, l.exercises.length)
          }, 0)
          const pct = totalEx > 0 ? Math.round((doneEx / totalEx) * 100) : 0
          return (
            <div key={idx} className="unit-card">
              <div className="unit-card-header">
                <div className="unit-card-icon">📚</div>
                <div className="unit-card-info">
                  <h3>{u.title}</h3>
                  <small>{u.lessons.length} lessons · {pct}% complete</small>
                </div>
                <button
                  id={`open-unit-${idx}`}
                  className="cta-btn active-green"
                  style={{ width: 'auto', padding: '10px 18px', fontSize: 14 }}
                  onClick={() => goUnit(idx)}
                >
                  Open
                </button>
              </div>
              <div style={{ padding: '0 18px 16px' }}>
                <div className="mini-progress-wrap" style={{ width: '100%', height: 10 }}>
                  <div className="mini-progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          )
        })}
        {showAuth && (
          <AuthOverlay 
            onClose={() => setShowAuth(false)} 
            onSuccess={(uid) => {
              console.log('User authenticated:', uid)
            }} 
          />
        )}
      </div>
    )
  }

  // ── Lessons screen ───────────────────────────────────────────────────────────
  if (lessonIdx === null && unit) {
    return (
      <div className="screen">
        <div className="crumbs">
          <span className="crumb" onClick={goHome}>🏠 Units</span>
          <span className="crumb-sep">›</span>
          <span className="crumb active">{unit.title}</span>
        </div>

        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

        <p className="section-title">Choose a lesson</p>

        <div className="unit-card">
          {unit.lessons.map((l, idx) => {
            const k = lessonKey(unitIdx, idx)
            const done = Math.min(loadProgress().lessonNextIndex[k] ?? 0, l.exercises.length)
            const pct = l.exercises.length > 0 ? Math.round((done / l.exercises.length) * 100) : 0
            const isComplete = done >= l.exercises.length
            return (
              <div
                key={idx}
                id={`start-lesson-${idx}`}
                className="list-item"
                onClick={() => startLesson(idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && startLesson(idx)}
              >
                <div style={{ fontSize: 20 }}>{isComplete ? '✅' : '📖'}</div>
                <div className="list-item-info">
                  <b>{l.title}</b>
                  <small>{done}/{l.exercises.length} exercises{isComplete ? ' · Complete!' : ''}</small>
                </div>
                <div className="mini-progress-wrap">
                  <div className="mini-progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <button 
                  className="theory-btn"
                  onClick={(e) => { e.stopPropagation(); viewTheoryOnly(unitIdx, idx); }}
                  title="View Theory"
                >
                  📖
                </button>
              </div>
            )
          })}
        </div>

        <button className="back-btn" onClick={goHome} style={{ alignSelf: 'flex-start' }}>
          ← Back to units
        </button>
        {showAuth && (
          <AuthOverlay 
            onClose={() => setShowAuth(false)} 
            onSuccess={(uid) => {
              console.log('User authenticated:', uid)
            }} 
          />
        )}
      </div>
    )
  }

  // ── Lesson complete screen ───────────────────────────────────────────────────
  if (unit && lesson && lessonComplete) {
    return (
      <div className="complete-screen">
        <span className="complete-trophy">🏆</span>
        <h2>Lesson complete!</h2>
        <p>You did great. Keep it up!</p>

        <div className="complete-stats">
          <div className="complete-stat">
            <span className="stat-val">{lesson.exercises.length}</span>
            <span className="stat-lbl">Exercises</span>
          </div>
          <div className="complete-stat">
            <span className="stat-val" style={{ color: lives <= 2 ? 'var(--red)' : 'var(--green)' }}>
              {lives}
            </span>
            <span className="stat-lbl">Lives left</span>
          </div>
          <div className="complete-stat">
            <span className="stat-val" style={{ color: wrongCount > 0 ? 'var(--red)' : 'var(--green)' }}>
              {wrongCount}
            </span>
            <span className="stat-lbl">Mistakes</span>
          </div>
        </div>

        <div className="complete-actions">
          <button
            id="redo-lesson-btn"
            className="cta-btn active-green"
            onClick={resetLesson}
          >
            🔄 Restart lesson
          </button>
          <button
            id="back-lessons-btn"
            className="back-btn"
            onClick={() => goUnit(unitIdx!)}
            style={{ alignSelf: 'center' }}
          >
            ← More lessons
          </button>
        </div>
        {showAuth && (
          <AuthOverlay 
            onClose={() => setShowAuth(false)} 
            onSuccess={(uid) => {
              console.log('User authenticated:', uid)
            }} 
          />
        )}
      </div>
    )
  }

  // ── Exercise screen ──────────────────────────────────────────────────────────
    if (unit && lesson) {
      if (viewingTheory) {
        return (
          <div className="screen theory-screen" style={{ overflowY: 'auto' }}>
            <ExerciseHeader lives={lives} progress={lessonProgress} theme={theme} toggleTheme={toggleTheme} />
            <div className="crumbs" style={{ marginBottom: 16, marginTop: 16 }}>
            <span className="crumb" onClick={goHome}>🏠</span>
            <span className="crumb-sep">›</span>
            <span className="crumb" onClick={() => goUnit(unitIdx!)}>
              {unit.title.length > 20 ? unit.title.slice(0, 20) + '…' : unit.title}
            </span>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-dark)', marginBottom: 16 }}>
            Theory: {lesson.title}
          </h2>
          <div 
            className="theory-markdown"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(lesson.theory) }}
          />
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <button 
            className="cta-btn active-green" 
            style={{ marginTop: 24, alignSelf: 'stretch' }} 
            onClick={() => setViewingTheory(false)}
          >
            Start Exercises
          </button>
        </div>
      )
    }

    if (!exercise) {
      setLessonComplete(true)
      return null
    }

    // Replace underscores in fill in the blank with inputs
    const renderFillInTheBlank = () => {
      if (exercise.type !== 'fill_in_the_blank') return null
      
      if (!exercise.question || !exercise.blanks) {
        return <p className="error-text">Exercise data is incomplete (missing question or blanks).</p>
      }

      const parts = exercise.question.split(/_+/)
      return (
        <p className="exercise-sentence" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          {parts.map((part, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{part}</span>
              {i < exercise.blanks.length && (
                <input
                  ref={el => { inputRefs.current[i] = el }}
                  type="text"
                  className={`fill-input${feedbackState === 'correct' ? ' correct' : feedbackState === 'incorrect' ? ' incorrect' : ''}`}
                  style={{ width: '120px', padding: '8px', fontSize: '18px', textAlign: 'center', margin: '4px 0' }}
                  value={textAnswers[i] || ''}
                  onChange={(e) => updateTextAnswer(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !ctaDisabled()) handleCheck() }}
                  placeholder="Answer…"
                  disabled={feedbackState !== 'idle'}
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </span>
          ))}
        </p>
      )
    }

    return (
      <div className="screen">
        <ExerciseHeader lives={lives} progress={lessonProgress} theme={theme} toggleTheme={toggleTheme} />
        <div className="exercise-content">
          {/* Breadcrumbs */}
          <div className="crumbs">
            <span className="crumb" onClick={goHome}>🏠</span>
            <span className="crumb-sep">›</span>
            <span className="crumb" onClick={() => goUnit(unitIdx!)}>
              {unit.title.length > 20 ? unit.title.slice(0, 20) + '…' : unit.title}
            </span>
            <span className="crumb-sep">›</span>
            <span className="crumb active">
              {nextIndex + 1}/{lesson.exercises.length}
            </span>
          </div>

          {/* Exercise type label */}
          {exercise.type === 'multiple_choice' && (
            <p className="exercise-label">Choose the correct answer</p>
          )}
          {exercise.type === 'fill_in_the_blank' && (
            <p className="exercise-label">Complete the sentence</p>
          )}
          {exercise.type === 'matching' && (
            <p className="exercise-label">Matching pairs</p>
          )}

          {/* Question / sentence */}
          {exercise.type === 'multiple_choice' && (
            <p className="exercise-question">{exercise.question}</p>
          )}
          
          {exercise.type === 'matching' && (
            <p className="exercise-question">{exercise.question}</p>
          )}

          {/* Inputs */}
          {exercise.type === 'multiple_choice' && (
            <div className="options-list" ref={optionsRef}>
              {exercise.options.map((opt, i) => {
                let cls = 'option-btn'
                if (feedbackState !== 'idle') {
                  if (opt.is_correct) cls += ' correct'
                  else if (i === selectedOptionIndex) cls += ' incorrect'
                } else if (i === selectedOptionIndex) {
                  cls += ' selected'
                }
                return (
                  <button
                    key={i}
                    id={`option-btn-${i}`}
                    className={cls}
                    disabled={feedbackState !== 'idle'}
                    onClick={() => handleOptionSelect(i)}
                  >
                    <span className="option-letter">{OPTION_LETTERS[i] ?? i + 1}</span>
                    {opt.text}
                  </button>
                )
              })}
            </div>
          )}

          {exercise.type === 'fill_in_the_blank' && renderFillInTheBlank()}

          {exercise.type === 'matching' && (
            <div className="matching-container">
              <div className="matching-column">
                {exercise.pairs.map((p, i) => (
                  <button
                    key={`term-${i}`}
                    className={`match-btn${selectedTerm === p.term ? ' selected' : ''}${matchedTerms.includes(p.term) ? ' matched' : ''}`}
                    onClick={() => handleMatchTerm(p.term)}
                    disabled={feedbackState !== 'idle' || matchedTerms.includes(p.term)}
                  >
                    {p.term}
                  </button>
                ))}
              </div>
              <div className="matching-column">
                {shuffledDefs.map((d, i) => (
                  <button
                    key={`def-${i}`}
                    className={`match-btn${selectedDef === d.text ? ' selected' : ''}${matchedTerms.some(t => exercise.pairs.find(p => p.term === t)?.definition === d.text) ? ' matched' : ''}`}
                    onClick={() => handleMatchDef(d.text)}
                    disabled={feedbackState !== 'idle' || matchedTerms.some(t => exercise.pairs.find(p => p.term === t)?.definition === d.text)}
                  >
                    {d.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hint */}
          {exercise.hint && feedbackState === 'idle' && (
            <p className="hint-text">💡 {exercise.hint}</p>
          )}
        </div>

        {/* CTA button */}
        {feedbackState === 'idle' && (
          <div className="cta-area">
            <button
              id="check-btn"
              className={ctaClass()}
              disabled={ctaDisabled()}
              onClick={handleCheck}
            >
              Check
            </button>
          </div>
        )}

        {/* Bottom sheet feedback */}
        <BottomSheet
          state={feedbackState}
          correctAnswer={getCorrectAnswer()}
          explanation={getExplanation()}
          successMessage={successMessage}
          onAction={handleSheetAction}
        />

        {showAuth && (
          <AuthOverlay 
            onClose={() => setShowAuth(false)} 
            onSuccess={(uid) => {
              console.log('User authenticated:', uid)
            }} 
          />
        )}
      </div>
    )
  }

  return null
}
