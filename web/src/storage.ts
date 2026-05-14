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

export function lessonKey(unitId: string, lessonId: string) {
  return `${unitId}.${lessonId}`
}

/**
 * Uploads local progress to Firestore for a specific user.
 */
export async function uploadProgress(userId: string, state: ProgressState): Promise<boolean> {
  if (!db) return false
  try {
    const userRef = doc(db, 'users', userId)
    await setDoc(userRef, { progress: state }, { merge: true })
    console.log('Progress uploaded successfully')
    return true
  } catch (error) {
    console.error('Error uploading progress:', error)
    return false
  }
}

/**
 * Downloads progress from Firestore and returns it.
 */
export async function downloadProgress(userId: string): Promise<ProgressState | null> {
  if (!db) return null
  try {
    const userRef = doc(db, 'users', userId)
    const snap = await getDoc(userRef)
    if (snap.exists()) {
      const data = snap.data()
      if (data.progress) {
        return data.progress as ProgressState
      }
    }
  } catch (error) {
    console.error('Error downloading progress:', error)
  }
  return null
}

/**
 * Bidirectional sync: downloads, merges with local, and uploads the result.
 */
export async function syncProgress(userId: string): Promise<ProgressState | null> {
  if (!db) {
    console.error('Firestore DB not initialized')
    return null
  }
  
  console.log(`Starting sync for user: ${userId}`)
  
  try {
    // 1. Download remote progress
    const remoteProgress = await downloadProgress(userId)
    const localProgress = loadProgress()
    
    console.log('Local progress:', localProgress)
    console.log('Remote progress:', remoteProgress)
    
    // 2. Merge strategy: take the highest index for each lesson
    const merged: ProgressState = { 
      lessonNextIndex: { ...localProgress.lessonNextIndex } 
    }
    
    let changesFound = false
    if (remoteProgress && remoteProgress.lessonNextIndex) {
      for (const [key, val] of Object.entries(remoteProgress.lessonNextIndex)) {
        const localVal = merged.lessonNextIndex[key] || 0
        const remoteVal = val as number
        if (remoteVal > localVal) {
          console.log(`Updating lesson ${key}: local ${localVal} -> remote ${remoteVal}`)
          merged.lessonNextIndex[key] = remoteVal
          changesFound = true
        }
      }
    }
    
    // Check if local has progress not in remote
    if (remoteProgress && remoteProgress.lessonNextIndex) {
       for (const [key, val] of Object.entries(localProgress.lessonNextIndex)) {
         const remoteVal = remoteProgress.lessonNextIndex[key] || 0
         if (val > remoteVal) {
           changesFound = true
           console.log(`Local progress for ${key} (${val}) is ahead of remote (${remoteVal})`)
         }
       }
    } else if (Object.keys(localProgress.lessonNextIndex).length > 0) {
      changesFound = true
      console.log('Remote progress is empty, local has data. Will upload.')
    }
    
    // 3. Save merged result locally
    saveProgress(merged)
    
    // 4. Upload merged result back to cloud if there were changes or if remote was empty
    if (changesFound || !remoteProgress) {
      console.log('Uploading merged progress to cloud...')
      await uploadProgress(userId, merged)
    } else {
      console.log('Progress already in sync, skipping upload.')
    }
    
    return merged
  } catch (error) {
    console.error('Error during syncProgress:', error)
    return null
  }
}

