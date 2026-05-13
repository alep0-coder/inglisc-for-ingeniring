import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'

const KEY = 'inglese.progress.v1'

export type ProgressState = {
  // lesson key -> index of next exercise to do (0..n)
  lessonNextIndex: Record<string, number>
}

const emptyState: ProgressState = { lessonNextIndex: {} }

export function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyState
    const parsed = JSON.parse(raw) as ProgressState
    if (!parsed || typeof parsed !== 'object') return emptyState
    return { lessonNextIndex: parsed.lessonNextIndex ?? {} }
  } catch {
    return emptyState
  }
}

export function saveProgress(state: ProgressState) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function lessonKey(unitIdx: number, lessonIdx: number) {
  return `${unitIdx}.${lessonIdx}`
}

/**
 * Uploads local progress to Firestore for a specific user.
 */
export async function uploadProgress(userId: string, state: ProgressState) {
  if (!db) return
  try {
    const userRef = doc(db, 'users', userId)
    await setDoc(userRef, { progress: state }, { merge: true })
    console.log('Progress uploaded successfully')
  } catch (error) {
    console.error('Error uploading progress:', error)
  }
}

/**
 * Downloads progress from Firestore and merges it with local storage.
 */
export async function downloadProgress(userId: string): Promise<ProgressState | null> {
  if (!db) return null
  try {
    const userRef = doc(db, 'users', userId)
    const snap = await getDoc(userRef)
    if (snap.exists()) {
      const data = snap.data()
      if (data.progress) {
        const remoteProgress = data.progress as ProgressState
        
        // Merge strategy: take the highest index for each lesson
        const localProgress = loadProgress()
        const merged: ProgressState = { lessonNextIndex: { ...localProgress.lessonNextIndex } }
        
        for (const [key, val] of Object.entries(remoteProgress.lessonNextIndex)) {
          merged.lessonNextIndex[key] = Math.max(merged.lessonNextIndex[key] || 0, val)
        }
        
        saveProgress(merged)
        return merged
      }
    }
  } catch (error) {
    console.error('Error downloading progress:', error)
  }
  return null
}

